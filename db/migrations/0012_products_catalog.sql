-- Products catalog: brands + products tables with videos.product_id FK.
-- Replaces the free-text brand + product_name pattern with a normalized
-- catalog so the Whisper transcription prompt can seed from canonical
-- ingredients per product. Fixes "Volufiline → Valofulin" and "Dr. Melaxin
-- → dr millexon" mishearings by feeding the recognizer the known vocabulary
-- per upload. Also pre-wires Phase 2 script-gen: an affiliate picks a real
-- product (with known formulation) from a dropdown instead of free-typing.
--
-- videos.brand + videos.product_name stay as denormalized cache columns.
-- The Slice 6 search_corpus RPC still reads them, so no RPC signature
-- change at this layer. The new /api/products/[id] PATCH route is the
-- single writer that propagates renames to the cache + corpus_chunks.metadata
-- (same pattern PATCH /api/videos/[id] already uses for niche_tag /
-- view_count / creator_handle).

-- 1. Slug helper. Lowercase, runs of non-alphanumeric → single dash, trim
--    leading/trailing dashes. Returns null for null/empty.
create or replace function slugify(input text)
returns text
language sql
immutable
as $$
  select case
    when input is null or trim(input) = '' then null
    else nullif(trim(both '-' from regexp_replace(lower(input), '[^a-z0-9]+', '-', 'g')), '')
  end;
$$;

-- 2. brands: small lookup table.
create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

-- 3. products: belongs to a brand. Canonical fields live here; per-video
--    extractions (videos.product_category[], active_ingredients[],
--    function_claims[]) capture the creator-spoken version, which can
--    differ from the canonical truth.
--
--    - ingredients[]: canonical INCI list. Seeds the Whisper prompt.
--    - product_category[]: canonical functional category + TikTok shop
--      classification.
--    - brand_claims[]: what the BRAND legally claims the product does.
--      Distinct from per-video function_claims[] (what THIS creator
--      promised in THIS video, often more aspirational).
create table products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete restrict,
  name text not null,
  slug text not null,
  ingredients text[] not null default '{}',
  product_category text[] not null default '{}',
  brand_claims text[] not null default '{}',
  source_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, slug)
);

create index idx_products_brand_id on products(brand_id);

-- 4. videos.product_id: FK to products. Nullable so:
--    (a) the migration's data backfill below can run before any row has it,
--    (b) duplicates / failed uploads (which never get brand+product set)
--        don't violate NOT NULL,
--    (c) STEP 1 falls back to a generic Whisper prompt if missing.
alter table videos add column product_id uuid references products(id) on delete set null;
create index idx_videos_product_id on videos(product_id);

-- 5. Data migration: brands. Distinct non-empty brand values from videos.
insert into brands (name, slug)
select distinct
  trim(brand),
  slugify(brand)
from videos
where brand is not null
  and trim(brand) <> ''
on conflict (name) do nothing;

-- 6. Data migration: products. One row per distinct (brand, product_name).
--    Pre-seeds products.ingredients[] with the merged distinct values from
--    every video tagged with the same brand+product — Cameron edits down
--    to canonical INCI on /products.
with product_keys as (
  select distinct trim(v.brand) as brand, trim(v.product_name) as product_name
  from videos v
  where v.brand is not null
    and v.product_name is not null
    and trim(v.product_name) <> ''
),
seeded as (
  select
    pk.brand,
    pk.product_name,
    array(
      select distinct ing
      from videos v2,
           unnest(coalesce(v2.active_ingredients, '{}'::text[])) as ing
      where trim(v2.brand) = pk.brand
        and trim(v2.product_name) = pk.product_name
      order by ing
    ) as ingredients
  from product_keys pk
)
insert into products (brand_id, name, slug, ingredients)
select
  b.id,
  s.product_name,
  slugify(s.product_name),
  s.ingredients
from seeded s
join brands b on b.name = s.brand
on conflict (brand_id, slug) do nothing;

-- 7. Set videos.product_id by matching on cached brand + product_name.
update videos v
set product_id = p.id
from products p
join brands b on b.id = p.brand_id
where v.brand is not null
  and v.product_name is not null
  and trim(v.brand) = b.name
  and trim(v.product_name) = p.name
  and v.product_id is null;

-- 8. Sanity check: every embedded video with a brand+product should now have
--    product_id. If the migration leaves any orphans, the data shape is
--    unexpected — fail loudly so we don't ship a half-migrated state.
do $$
declare
  orphan_count int;
begin
  select count(*) into orphan_count
  from videos
  where status = 'embedded'
    and product_id is null
    and brand is not null
    and product_name is not null
    and trim(brand) <> ''
    and trim(product_name) <> '';
  if orphan_count > 0 then
    raise exception
      'migration 0012: % embedded videos have brand+product_name but no product_id after backfill — data shape unexpected',
      orphan_count;
  end if;
end$$;
