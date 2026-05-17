-- Slice 4: embeddings + similar-videos.
--
-- corpus_chunks is video-only at this stage. PLAN.md §2 defines the unified
-- (video_id, knowledge_item_id) shape, but knowledge_items doesn't land until
-- Slice 5; adding the column + FK + exclusivity check now would be deadweight.
-- Slice 5's migration will ALTER TABLE to add source_type, knowledge_item_id,
-- and the exclusivity check.

create extension if not exists vector;

create table corpus_chunks (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  chunk_kind text not null,
    -- 'transcript' | 'breakdown_summary' | 'male_creator_relevance'
    -- | 'buyer_psych_levers' | 'pacing_notes' | 'visual_style_notes'
  chunk_index int not null,
    -- 0 for the single-chunk facets; sequential for transcript
  text text not null,
  embedding vector(1536) not null,
  t_start numeric,
  t_end numeric,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index corpus_chunks_embedding_idx
  on corpus_chunks using hnsw (embedding vector_cosine_ops);
create index corpus_chunks_video_idx on corpus_chunks (video_id);
create index corpus_chunks_niche_tag_idx
  on corpus_chunks ((metadata->>'niche_tag'));

-- Lets STEP 4 use ON CONFLICT DO NOTHING so a partial-batch crash retries
-- cleanly without manual cleanup.
create unique index corpus_chunks_video_unique
  on corpus_chunks (video_id, chunk_kind, chunk_index);

-- similar_videos(target_id, k) — returns the k nearest other videos by
-- cosine distance on the breakdown_summary chunk. PLAN.md §6 names
-- breakdown_summary as the unified semantic representation of a video.
create or replace function similar_videos(target_id uuid, k int default 5)
returns table (
  video_id uuid,
  similarity float,
  filename text,
  niche_tag text,
  first_frame_path text
)
language sql
stable
as $$
  with target as (
    select embedding
    from corpus_chunks
    where corpus_chunks.video_id = target_id
      and chunk_kind = 'breakdown_summary'
    limit 1
  )
  select
    cc.video_id,
    (1 - (cc.embedding <=> (select embedding from target)))::float as similarity,
    v.filename,
    v.niche_tag,
    (
      select kf.storage_path
      from key_frames kf
      where kf.video_id = cc.video_id
      order by kf.frame_index asc
      limit 1
    ) as first_frame_path
  from corpus_chunks cc
  join videos v on v.id = cc.video_id
  where cc.chunk_kind = 'breakdown_summary'
    and cc.video_id <> target_id
    and exists (select 1 from target)
  order by cc.embedding <=> (select embedding from target)
  limit k;
$$;
