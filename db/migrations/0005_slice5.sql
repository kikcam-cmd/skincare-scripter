-- Slice 5: knowledge ingestion (PDF/MD/TXT/pasted).
--
-- Lands knowledge_items, widens corpus_chunks to be a unified video+knowledge
-- store, and provisions a separate `knowledge` storage bucket. The existing
-- similar_videos() function is unaffected — it already filters on
-- chunk_kind = 'breakdown_summary', which is video-only.

create table knowledge_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('pdf', 'md', 'txt', 'pasted')),
  storage_path text,
  filename text,
  title text,
  source_label text,
  pasted_text text,
  status pipeline_status not null default 'uploaded',
  error_message text,
  created_at timestamptz not null default now(),
  -- pasted items keep their text in-row; file-backed items must have a
  -- storage_path. Enforce so the pipeline can branch on kind without
  -- defensive null checks.
  check (
    (kind = 'pasted' and pasted_text is not null and storage_path is null)
    or (kind <> 'pasted' and storage_path is not null and pasted_text is null)
  )
);
create index knowledge_items_status_idx on knowledge_items (status);

-- Widen corpus_chunks: video-only → video|knowledge.
create type source_type as enum ('video', 'knowledge');

alter table corpus_chunks
  alter column video_id drop not null,
  add column knowledge_item_id uuid references knowledge_items(id) on delete cascade,
  add column page_number int,
  add column section_label text,
  add column source_type source_type;

-- Backfill the existing video rows before adding the NOT NULL + CHECK.
update corpus_chunks set source_type = 'video' where video_id is not null;

alter table corpus_chunks
  alter column source_type set not null,
  add constraint corpus_chunks_one_source
    check ((video_id is not null) <> (knowledge_item_id is not null));

-- Replace the unconditional video unique index with a partial one + add the
-- knowledge equivalent. Slice 4 created corpus_chunks_video_unique as
-- unconditional; now that video_id is nullable it needs the predicate.
drop index corpus_chunks_video_unique;
create unique index corpus_chunks_video_unique
  on corpus_chunks (video_id, chunk_kind, chunk_index)
  where video_id is not null;
create unique index corpus_chunks_knowledge_unique
  on corpus_chunks (knowledge_item_id, chunk_kind, chunk_index)
  where knowledge_item_id is not null;

create index corpus_chunks_source_type_idx on corpus_chunks (source_type);
create index corpus_chunks_knowledge_idx on corpus_chunks (knowledge_item_id);

-- Knowledge bucket: private, 50MB per file. The project-level cap is 500MB
-- (set for videos), so without a per-bucket limit a single 100MB PDF would
-- be accepted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge',
  'knowledge',
  false,
  52428800,  -- 50MB
  array['application/pdf', 'text/markdown', 'text/x-markdown', 'text/plain', 'application/octet-stream']
)
on conflict (id) do nothing;
