-- Slice 2: persist what the pipeline already produces — transcripts, transcript
-- chunks, and key frames. Lets the video detail page become a study tool
-- (video player + clickable timestamps + frame strip) instead of just a JSON
-- dump of the Claude breakdown.

create table transcripts (
  video_id uuid primary key references videos(id) on delete cascade,
  full_text text not null,
  language text,
  raw_groq_response jsonb not null,
  created_at timestamptz not null default now()
);

create table transcript_chunks (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  chunk_index int not null,
  text text not null,
  t_start numeric not null,
  t_end numeric not null,
  unique (video_id, chunk_index)
);
create index transcript_chunks_video_tstart_idx
  on transcript_chunks (video_id, t_start);

create table key_frames (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  frame_index int not null,
  t_seconds numeric not null,
  storage_path text not null,
  unique (video_id, frame_index)
);
