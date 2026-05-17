-- Slice 7 (final round): promote source-trust constants from a hardcoded
-- map in lib/search/trust.ts to a DB table so they're editable from the
-- /trust admin page. PLAN §8 calls for this in Phase 2; doing it now to
-- avoid a redeploy every time Cameron tunes a weight.
--
-- Weights are a multiplier the in-app ranker normalizes to [0, 1] before
-- multiplying by 0.05. ~0.5 = low-trust, 1.0 = default, ~1.5 = high-trust.

create table source_trust (
  label text primary key,
  weight numeric not null default 1.0 check (weight >= 0 and weight <= 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed with the values currently in lib/search/trust.ts so rank parity is
-- preserved at deploy time.
insert into source_trust (label, weight) values
  ('Hormozi - $100M Offers', 1.2),
  ('personal notes', 0.7)
on conflict (label) do nothing;
