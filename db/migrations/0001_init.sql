-- Slice 1 subset of PLAN §2: only the tables Slice 1 needs.
-- Later slices add their own migrations: 0002 (transcripts/frames),
-- 0003 (resume/status hardening), 0004 (corpus_chunks + vector), 0005 (knowledge).

create extension if not exists pgcrypto;

create type pipeline_status as enum (
  'uploaded', 'transcribed', 'frames_extracted',
  'analyzed', 'embedded', 'failed', 'duplicate'
);

create table videos (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  filename text not null,
  content_hash text,
  creator_handle text,
  view_count bigint,
  posted_at date,
  niche_tag text,
  duration_seconds numeric,
  status pipeline_status not null default 'uploaded',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index videos_content_hash_unique on videos (content_hash) where content_hash is not null;
create index videos_status_idx on videos (status);

create table breakdowns (
  video_id uuid primary key references videos(id) on delete cascade,
  hook jsonb,
  problem jsonb,
  twist jsonb,
  solution jsonb,
  cta jsonb,
  tonality text,
  authenticity_signals text[],
  pacing_notes text,
  buyer_psychology_levers text[],
  visual_style_notes text,
  male_creator_relevance text,
  raw_claude_response jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);
