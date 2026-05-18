# 0010 brain-quality backfill runbook

Re-extract the 3 surviving embedded videos under the new prompt + schema
from migration `0010_brain_quality.sql`. They were originally analyzed
under the Slice 5.5 prompt; the new prompt adds `product_category`,
`active_ingredients`, `function_claims` extraction and the structured
schema landed on `videos.*` empty for those rows. Same prompt also drops
tonality out of `breakdown_summary` into its own chunk, and adds
`authenticity_signals` as a new retrieval surface.

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

1. **Optional: backfill analytics fields first** so the new run picks
   them up from the videos row. Otherwise gmv_usd / items_sold / view_count
   / posted_at can be filled inline via the metadata edit form after
   re-extraction lands. Example:

   ```sql
   update videos set
     view_count = NULL,        -- fill in real numbers
     posted_at = NULL,
     gmv_usd = NULL,
     items_sold = NULL
   where id = 'd21d7f8b-661d-4b9d-abc3-82f1ffa2b618';
   -- (repeat for the other two)
   ```

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
   - `videos.product_category` populated (single canonical value)
   - `videos.active_ingredients[]` populated (INCI names where named in
     transcript)
   - `videos.function_claims[]` populated (3-6 end-user outcomes)
   - `videos.ai_tags[]` populated (5-10 audience/format/use-case tags,
     no longer duplicating product fields)
   - `breakdowns.tonality`, `breakdowns.authenticity_signals[]` populated
   - `corpus_chunks` regenerated, now including `chunk_kind='tonality'`
     and `chunk_kind='authenticity_signals'` rows alongside the existing
     facets.

   Spot-check by visiting `/search`, picking a `product_category` or
   `active_ingredient` filter pill, and confirming the right videos
   surface.

## Rollback

If the new prompt regresses quality on any video, the prior breakdown
content lives in the session transcript dump. Restore by re-inserting
the breakdowns rows + re-running STEP 4 (which will regenerate
embeddings from the restored text):

```sql
-- (paste the captured breakdowns rows back in via insert)
delete from corpus_chunks where video_id = '<id>';
update videos set status='analyzed' where id='<id>';
-- then trigger retry to re-run STEP 4 only.
```
