# 0010 + 0011 brain-quality backfill runbook

> **Status: superseded by the Slice 9 backfill (2026-05-29).** The 9-video
> Slice 9 backfill was a strict superset of this runbook's 3-video scope
> (the 3 original videos `d21d7f8b` / `5d44a1de` / `d5240f30` were included)
> and applied both the Slice 8 brain-quality fixes *and* the Slice 9
> product-aware Whisper biasing in one pass. The insurance dump from that
> run lives at `db/backfill/0012_pre_rerun.json`; the per-step execution is
> documented in `STATUS.md` § "Slice 9 backfill + canary re-run complete
> (2026-05-29)". This file is kept for archaeology only.

---

Re-extract the 3 surviving embedded videos under the new prompt + schema
from migrations `0010_brain_quality.sql` + `0011_product_category_array.sql`.
They were originally analyzed under the Slice 5.5 prompt; the new prompt
adds `product_category` (text[] — multiple values capturing functional
category + TikTok shop classification + alternative use-case framings),
`active_ingredients`, `function_claims` (now reframed to capture
creator-spoken positioning, not just brand-compliant outcomes). Same
prompt drops tonality out of `breakdown_summary` into its own chunk and
adds `authenticity_signals` as a new retrieval surface.

> **Heads-up before running:** Cameron hand-stamped `product_category`,
> `active_ingredients`, `function_claims` values on all 3 videos as of
> 2026-05-18 (see STATUS.md corpus-state table). Step 2 below resets
> those columns to `'{}'` so STEP 3 can repopulate from Claude's
> extraction. **Claude cannot derive Cameron's TikTok shop categories
> (e.g. `moisturizers-and-mists` for `d5240f30`) from video content —
> those are platform metadata.** If preserving them matters, dump
> current values first and re-stamp via the inline metadata editor
> after backfill completes.

## Target video IDs

| ID | Brand | Product |
|---|---|---|
| `d21d7f8b-661d-4b9d-abc3-82f1ffa2b618` | Medicube | Zero Pore Blackhead Mud Mask |
| `5d44a1de-53a1-4af4-862f-fdfee90c5de2` | Dr. Melaxin | BP Spicule Plumping Lip Shot |
| `d5240f30-86c6-4dd5-882b-b59b04b90db9` | Dr. Melaxin | Calcium Multi Balm |

## Insurance

Pre-delete dumps for `breakdowns` (3 rows) and `corpus_chunks` (22 rows,
text + metadata, no embeddings — those regenerate from text via STEP 4)
live at `db/backfill/0010_pre_rerun.json`. To restore manually, parse
the file and re-insert via the Supabase dashboard SQL editor or
`mcp__claude_ai_Supabase__execute_sql`. Supabase point-in-time recovery
also covers a 7-day window from the delete timestamp on Pro plans —
check the dashboard before deleting if rolling back later.

## Steps

1. ~~**Backfill analytics fields first.**~~ Done 2026-05-18 — Cameron
   stamped `view_count`, `posted_at`, `gmv_usd`, `items_sold` on all
   3 videos via the metadata editor. Skip this step unless adding more
   analytics (e.g. updated GMV later). Step 2 explicitly preserves the
   analytics columns (they're not reset to NULL).

   **Optional: dump Cameron's hand-stamped product_category /
   active_ingredients / function_claims first** so they can be
   re-merged or re-stamped after Claude's overwrite:
   ```sql
   select id, product_category, active_ingredients, function_claims
   from videos
   where id in (
     'd21d7f8b-661d-4b9d-abc3-82f1ffa2b618',
     '5d44a1de-53a1-4af4-862f-fdfee90c5de2',
     'd5240f30-86c6-4dd5-882b-b59b04b90db9'
   );
   ```
   Save the output somewhere durable (e.g. paste into a scratch file)
   before running step 2. Particularly important for `d5240f30` whose
   `moisturizers-and-mists` is the TikTok shop category — Claude won't
   recover that from the video itself.

2. **Delete breakdowns + corpus_chunks for the 3 IDs.** Transcripts +
   key_frames stay — the pipeline gates skip STEP 1 + STEP 2 when those
   exist, so re-runs only repeat STEP 3 (Claude breakdown) + STEP 4
   (embeddings). status reset isn't strictly required (pipeline doesn't
   gate on status), but resetting makes the UI honest while it re-runs.

   ```sql
   delete from corpus_chunks where video_id in (
     'd21d7f8b-661d-4b9d-abc3-82f1ffa2b618',
     '5d44a1de-53a1-4af4-862f-fdfee90c5de2',
     'd5240f30-86c6-4dd5-882b-b59b04b90db9'
   );
   delete from breakdowns where video_id in (
     'd21d7f8b-661d-4b9d-abc3-82f1ffa2b618',
     '5d44a1de-53a1-4af4-862f-fdfee90c5de2',
     'd5240f30-86c6-4dd5-882b-b59b04b90db9'
   );
   update videos set
     status = 'frames_extracted',
     product_category = null,
     active_ingredients = '{}',
     function_claims = '{}',
     ai_tags = '{}'
   where id in (
     'd21d7f8b-661d-4b9d-abc3-82f1ffa2b618',
     '5d44a1de-53a1-4af4-862f-fdfee90c5de2',
     'd5240f30-86c6-4dd5-882b-b59b04b90db9'
   );
   ```

3. **Trigger re-runs.** Three options, pick whichever is convenient:

   - **Browser:** open `/videos/<id>` and click "Re-run pipeline" for
     each of the 3 IDs.
   - **CLI:** `npm run process-video <id>` for each (uses `.env.local`).
   - **API:** `POST /api/videos/<id>/retry` via curl + Basic Auth.

4. **Verify.** Each video should re-land at `status='embedded'` with:
   - `videos.product_category[]` populated (1–4 lowercase-hyphen values
     capturing functional category + alternative use-case framings;
     Claude won't emit TikTok shop categories like
     `moisturizers-and-mists` — those need re-stamping post-backfill)
   - `videos.active_ingredients[]` populated (INCI names where named in
     transcript)
   - `videos.function_claims[]` populated (creator-spoken positioning:
     outcomes / problems addressed / aspirational framings, 3–8 typical)
   - `videos.ai_tags[]` populated (5-10 audience/format/use-case tags,
     no longer duplicating product fields)
   - `breakdowns.tonality`, `breakdowns.authenticity_signals[]` populated
   - `corpus_chunks` regenerated, now including `chunk_kind='tonality'`
     and `chunk_kind='authenticity_signals'` rows alongside the existing
     facets.

   Spot-check by visiting `/search`, picking a `product_category` or
   `active_ingredient` filter pill, and confirming the right videos
   surface.

5. **Re-stamp any Cameron-supplied values** (TikTok shop categories,
   manual function_claims tweaks) via the inline metadata editor on
   `/videos/<id>` — using the dump from step 1.

## Rollback

If the new prompt regresses quality on any video, the prior breakdown
content lives in `db/backfill/0010_pre_rerun.json` (3 breakdowns + 22
corpus_chunks, no embeddings — regenerable). Restore by re-inserting
the breakdowns rows + re-running STEP 4:

```sql
-- 1. parse db/backfill/0010_pre_rerun.json into INSERT statements for
--    breakdowns + corpus_chunks (drop the embedding column; STEP 4
--    regenerates it). Run them.
-- 2. then:
update videos set status='analyzed' where id='<id>';
-- 3. trigger retry. Pipeline gates skip STEP 1-3 since their rows
--    exist; STEP 4 regenerates embeddings from the restored chunk text.
```

Supabase point-in-time recovery also covers a 7-day window from the
delete timestamp on Pro plans — check the dashboard if rolling back
later than that.
