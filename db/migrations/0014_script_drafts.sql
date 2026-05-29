-- Phase 2 Slice 0: script-gen prototype storage.
--
-- Single-user testbed behind the existing proxy.ts Basic Auth gate. No
-- owner_id / RLS yet — those land in Slice 1 alongside Supabase Auth and
-- the profiles.is_admin retrofit. Adding owner_id later is a non-breaking
-- alter (nullable column, backfill Cameron's user id, then NOT NULL +
-- enable RLS). PLAN_PHASE2 §4 has the full Branch-A target shape.
--
-- Output shape per the resolved §2.3 contract (2026-05-29): caller picks
-- per request. Claude classifies the intent and calls one of four tools
-- (submit_hook_ideas | submit_full_script | submit_demo_angle |
-- submit_freeform). output_kind records which one fired so the render
-- layer can dispatch; output jsonb holds the tool input verbatim.
--
-- Citations are inline in the output (each hook / beat / paragraph carries
-- cited_chunk_ids: text[]). retrieved_chunk_ids[] is the universe the LLM
-- was allowed to cite from — server validates every cited id ∈ this set
-- before persisting. No top-level citations column — re-derive from output
-- when rendering. One source of truth per advisor.

create type script_draft_status as enum (
  'retrieving',
  'generating',
  'completed',
  'failed'
);

create type script_output_kind as enum (
  'hook_ideas',
  'full_script',
  'demo_angle',
  'freeform'
);

create table script_drafts (
  id uuid primary key default gen_random_uuid(),
  status script_draft_status not null default 'retrieving',

  -- Request inputs
  product_id uuid references products(id) on delete set null,
  -- Denormalized at insert time so the result page can render without a join
  -- and so a later product rename doesn't retroactively rewrite the draft.
  product_brand text,
  product_name text,
  intent text not null,
  creator_gender creator_gender not null default 'unknown',

  -- Output
  output_kind script_output_kind,
  output jsonb,
  retrieved_chunk_ids text[],
  model text,
  raw_claude_response jsonb,

  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on script_drafts (created_at desc);
create index on script_drafts (status);
create index on script_drafts (product_id);
