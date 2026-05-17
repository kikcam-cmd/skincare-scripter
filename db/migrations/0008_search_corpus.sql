-- Slice 6: unified semantic search across video + knowledge chunks.
--
-- Single RPC that takes a query embedding + optional filter pills, runs the
-- HNSW cosine search, LEFT JOINs the parent video/knowledge rows so the
-- caller gets everything it needs for ranking + card rendering in one round
-- trip. supabase-js can't express the `<=>` operator through PostgREST, so
-- an RPC is the only practical shape (mirrors Slice 4's similar_videos).
--
-- Recency uses the parent row's date (posted_at falling back to created_at
-- for videos; created_at for knowledge_items) NOT the chunk's created_at —
-- re-embedding a video should not reset its recency score.

create or replace function search_corpus(
  query_embedding vector(1536),
  p_source_type text default null,
  p_niche_tag text default null,
  p_source_label text default null,
  p_creator_gender creator_gender default null,
  p_brand text default null,
  p_product_name text default null,
  p_ai_tag text default null,
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
    ki.title as knowledge_title,
    ki.filename as knowledge_filename,
    ki.kind as knowledge_kind,
    ki.source_label as knowledge_source_label,
    ki.created_at as knowledge_created_at
  from corpus_chunks cc
  left join videos v on v.id = cc.video_id
  left join knowledge_items ki on ki.id = cc.knowledge_item_id
  where (p_source_type is null or cc.source_type::text = p_source_type)
    and (p_niche_tag is null or v.niche_tag = p_niche_tag)
    and (p_source_label is null or ki.source_label = p_source_label)
    and (p_creator_gender is null or v.creator_gender = p_creator_gender)
    and (p_brand is null or v.brand = p_brand)
    and (p_product_name is null or v.product_name = p_product_name)
    and (p_ai_tag is null or p_ai_tag = any(v.ai_tags))
  order by cc.embedding <=> query_embedding
  limit k;
$$;
