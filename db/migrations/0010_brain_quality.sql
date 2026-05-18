-- Brain-quality slice: structured product axes for cross-brand retrieval
-- ("Dr. Melaxin Lip Plumper" should match other lip plumpers; "hypochlorous
-- acid" videos should match across brands), conversion-signal columns
-- (gmv_usd + items_sold are stronger "did this video convert" signals than
-- view_count alone), knowledge-corpus cleanup, trust-map flattening.
--
-- Tonality stays on breakdowns (Claude analysis), not videos (user metadata).
-- search_corpus gains a LEFT JOIN to breakdowns so tonality can be a filter
-- pill without owning it twice.

-- 1. Structured product axes on videos. ai_tags survives for everything that
--    doesn't fit (audience, format, use case).
alter table videos
  add column product_category text,
  add column active_ingredients text[] not null default '{}',
  add column function_claims text[] not null default '{}',
  add column gmv_usd numeric,
  add column items_sold integer;

-- 2. Label the Cialdini PDF (verified by reading chunk_index 0 — title page
--    matches "INFLUENCE: The Psychology of Persuasion, ROBERT B. CIALDINI").
--    Title-less knowledge items render as "Untitled · p.N" in citations and
--    the trust map can't grip on a null source_label.
update knowledge_items
set title = 'Influence: The Psychology of Persuasion',
    source_label = 'Cialdini - Influence'
where id = '6898187f-6343-4c46-9c04-e12fc000a0a0';

-- 3. Retire the pre-pivot "Male creator skincare positioning (notes)"
--    knowledge item. Pre-dates migration 0007 when the project was framed
--    male-creator-in-female-niche; the framing has changed and this content
--    no longer reflects current positioning. corpus_chunks rows are deleted
--    explicitly (FK cascade behavior not verified here).
delete from corpus_chunks
where knowledge_item_id = 'ee328496-e9be-454e-b524-49ffe68c947f';

delete from knowledge_items
where id = 'ee328496-e9be-454e-b524-49ffe68c947f';

-- 4. Flatten source_trust to 1.0 for all real sources. The "Hormozi" label
--    was a stub example never backed by a real knowledge_item — drop it.
--    Cameron's stance: all knowledge is trusted equally for script-gen.
--    The lever (table + /trust admin) stays for later differentiation.
delete from source_trust where label = 'Hormozi - $100M Offers';
update source_trust set weight = 1.0;

-- 5. Replace search_corpus with the extended signature: new filter params
--    (p_product_category, p_active_ingredient, p_function_claim, p_tonality)
--    + new projected columns (video_product_category, video_active_ingredients,
--    video_function_claims, video_gmv_usd, video_items_sold, video_tonality).
--    LEFT JOIN breakdowns so tonality can filter without leaving its
--    ownership home. Existing filters compile away when null — same pattern
--    as 0008.
drop function if exists search_corpus(vector, text, text, text, creator_gender, text, text, text, int);

create or replace function search_corpus(
  query_embedding vector(1536),
  p_source_type text default null,
  p_niche_tag text default null,
  p_source_label text default null,
  p_creator_gender creator_gender default null,
  p_brand text default null,
  p_product_name text default null,
  p_ai_tag text default null,
  p_product_category text default null,
  p_active_ingredient text default null,
  p_function_claim text default null,
  p_tonality text default null,
  k int default 30
)
returns table (
  chunk_id uuid,
  source_type source_type,
  chunk_kind text,
  chunk_index int,
  text text,
  similarity float,
  t_start numeric,
  t_end numeric,
  page_number int,
  section_label text,
  metadata jsonb,
  video_id uuid,
  knowledge_item_id uuid,
  video_filename text,
  video_niche_tag text,
  video_brand text,
  video_product_name text,
  video_creator_gender creator_gender,
  video_view_count bigint,
  video_ai_tags text[],
  video_posted_at date,
  video_created_at timestamptz,
  video_product_category text,
  video_active_ingredients text[],
  video_function_claims text[],
  video_gmv_usd numeric,
  video_items_sold integer,
  video_tonality text,
  knowledge_title text,
  knowledge_filename text,
  knowledge_kind text,
  knowledge_source_label text,
  knowledge_created_at timestamptz
)
language sql
stable
as $$
  select
    cc.id as chunk_id,
    cc.source_type,
    cc.chunk_kind,
    cc.chunk_index,
    cc.text,
    (1 - (cc.embedding <=> query_embedding))::float as similarity,
    cc.t_start,
    cc.t_end,
    cc.page_number,
    cc.section_label,
    cc.metadata,
    cc.video_id,
    cc.knowledge_item_id,
    v.filename as video_filename,
    v.niche_tag as video_niche_tag,
    v.brand as video_brand,
    v.product_name as video_product_name,
    v.creator_gender as video_creator_gender,
    v.view_count as video_view_count,
    v.ai_tags as video_ai_tags,
    v.posted_at as video_posted_at,
    v.created_at as video_created_at,
    v.product_category as video_product_category,
    v.active_ingredients as video_active_ingredients,
    v.function_claims as video_function_claims,
    v.gmv_usd as video_gmv_usd,
    v.items_sold as video_items_sold,
    b.tonality as video_tonality,
    ki.title as knowledge_title,
    ki.filename as knowledge_filename,
    ki.kind as knowledge_kind,
    ki.source_label as knowledge_source_label,
    ki.created_at as knowledge_created_at
  from corpus_chunks cc
  left join videos v on v.id = cc.video_id
  left join breakdowns b on b.video_id = cc.video_id
  left join knowledge_items ki on ki.id = cc.knowledge_item_id
  where (p_source_type is null or cc.source_type::text = p_source_type)
    and (p_niche_tag is null or v.niche_tag = p_niche_tag)
    and (p_source_label is null or ki.source_label = p_source_label)
    and (p_creator_gender is null or v.creator_gender = p_creator_gender)
    and (p_brand is null or v.brand = p_brand)
    and (p_product_name is null or v.product_name = p_product_name)
    and (p_ai_tag is null or p_ai_tag = any(v.ai_tags))
    and (p_product_category is null or v.product_category = p_product_category)
    and (p_active_ingredient is null or p_active_ingredient = any(v.active_ingredients))
    and (p_function_claim is null or p_function_claim = any(v.function_claims))
    and (p_tonality is null or b.tonality = p_tonality)
  order by cc.embedding <=> query_embedding
  limit k;
$$;
