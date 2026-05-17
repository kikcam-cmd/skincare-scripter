-- Metadata pivot: drop the male-in-female-niche positioning baked into the
-- schema, and pre-wire the per-video metadata that Phase 2 script generation
-- will need (brand, product, creator gender, freeform notes, AI tags).
--
-- Why this exists: the original schema put a `male_creator_relevance` column
-- on every breakdown because v0 was framed as a male-creator-in-female-niche
-- tool. That framing has changed — the tool is for skincare creators of any
-- gender, and gender is per-video metadata + a Phase 2 script-request param,
-- not a global product axis. The breakdown becomes gender-neutral with a
-- single optional `gender_specific_notes` field that Claude fills only when
-- a real gendered nuance exists.

create type creator_gender as enum ('male', 'female', 'unknown');

alter table videos
  add column creator_gender creator_gender not null default 'unknown',
  add column brand text,
  add column product_name text,
  add column user_notes text,
  add column ai_tags text[] not null default '{}';

-- Defunct chunks from the prior schema. The column they reference is being
-- dropped; if we leave them they hang around in the HNSW index forever as
-- orphaned vectors. (The per-video backfill in the next slice step deletes
-- the remaining chunks for the 2 surviving videos so STEP 4 re-runs cleanly.)
delete from corpus_chunks where chunk_kind = 'male_creator_relevance';

alter table breakdowns
  drop column male_creator_relevance,
  add column gender_specific_notes text;
