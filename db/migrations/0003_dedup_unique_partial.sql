-- Slice 3 follow-up: the original partial unique index on content_hash
-- blocked the dedup STEP 0 from writing the hash on a duplicate row, so
-- the duplicate-marking update was silently rejected and the row stayed
-- in 'uploaded' forever. Widening the predicate to exclude duplicate
-- rows keeps "at most one canonical row per hash" while letting
-- duplicates retain the hash for audit/cleanup queries.

drop index if exists videos_content_hash_unique;

create unique index videos_content_hash_unique
  on videos (content_hash)
  where content_hash is not null and status <> 'duplicate';
