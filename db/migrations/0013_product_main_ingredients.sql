-- Split product ingredients into two lists.
--
-- products.ingredients[] stays as the full INCI deck — useful reference but
-- noisy for Whisper biasing and Claude spelling correction (the 91-INCI
-- Boost Set blows past Whisper's 224-token prompt budget).
--
-- products.main_ingredients[] is the curated subset of actives Cameron
-- wants the pipeline to focus on. Pipeline STEP 1 + STEP 3 read this list;
-- they fall back to ingredients[] when main_ingredients is empty so
-- un-curated products still get biasing.

alter table products
  add column main_ingredients text[] not null default '{}';
