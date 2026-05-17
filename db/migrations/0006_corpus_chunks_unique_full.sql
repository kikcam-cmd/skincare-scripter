-- 0005 made both corpus_chunks unique indexes partial (predicated on the
-- non-null column). That broke ON CONFLICT in supabase-js upserts:
--   ERROR: there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
-- because Postgres requires either a non-partial unique constraint matching
-- the conflict target, or an explicit ON CONFLICT (cols) WHERE pred clause
-- that supabase-js does not emit.
--
-- The exclusivity CHECK (corpus_chunks_one_source) plus Postgres' NULLs-are-
-- distinct semantics mean a non-partial unique index on
-- (video_id, chunk_kind, chunk_index) is safe for knowledge rows
-- (video_id is null → all NULLs distinct → no false conflicts), and vice
-- versa for (knowledge_item_id, chunk_kind, chunk_index). The two indexes
-- together enforce the right invariant for both row types.

drop index corpus_chunks_video_unique;
drop index corpus_chunks_knowledge_unique;

create unique index corpus_chunks_video_unique
  on corpus_chunks (video_id, chunk_kind, chunk_index);

create unique index corpus_chunks_knowledge_unique
  on corpus_chunks (knowledge_item_id, chunk_kind, chunk_index);
