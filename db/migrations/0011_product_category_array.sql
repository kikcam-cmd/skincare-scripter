-- Widen videos.product_category from text to text[]. Cameron's reasoning:
-- products legitimately fit multiple categories — TikTok shop's official
-- classification (e.g. "Lipstick & Lip Gloss" for a lip plumper) often
-- differs from the functional category creators promote (`lip-plumper`),
-- and creators describe products under different use-case framings. A
-- single canonical category drops that signal; an array preserves it and
-- still indexes cleanly via `= any(arr)` in the RPC (same pattern as
-- ai_tags / active_ingredients / function_claims).

alter table videos
  alter column product_category type text[]
  using (
    case
      when product_category is null then '{}'::text[]
      when id = '5d44a1de-53a1-4af4-862f-fdfee90c5de2' then array['lip-plumper', 'lipstick-and-lip-gloss']
      when id = 'd21d7f8b-661d-4b9d-abc3-82f1ffa2b618' then array['face-mask']
      else array[lower(replace(product_category, ' ', '-'))]
    end
  );

alter table videos
  alter column product_category set default '{}',
  alter column product_category set not null;

-- Clear accidental copy-paste of "Lip Plumper" into user_notes for 5d44a1de.
update videos set user_notes = null where id = '5d44a1de-53a1-4af4-862f-fdfee90c5de2';

-- Replace search_corpus: filter switches from equality to array-membership
-- (matches p_ai_tag's existing shape), return type for video_product_category
-- becomes text[]. Everything else unchanged from migration 0010.
drop function if exists search_corpus(vector, text, text, text, creator_gender, text, text, text, text, text, text, text, int);

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
  video_product_category text[],
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
    and (p_product_category is null or p_product_category = any(v.product_category))
    and (p_active_ingredient is null or p_active_ingredient = any(v.active_ingredients))
    and (p_function_claim is null or p_function_claim = any(v.function_claims))
    and (p_tonality is null or b.tonality = p_tonality)
  order by cc.embedding <=> query_embedding
  limit k;
$$;
