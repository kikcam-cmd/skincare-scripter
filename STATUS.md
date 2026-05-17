# Status

Rolling session-handoff doc. Read this first when picking up the project — it points at the source-of-truth files and tells you exactly what to do next. Update it at the end of every working session.

---

## Where we are right now

**Phase:** **Slice 5 shipped + smoke-tested.** Knowledge ingestion is
live: PDF / MD / TXT / pasted text all flow through
`processKnowledge()`, parse to blocks (page boundaries for PDF via
`unpdf`, heading-anchored sections for MD via `marked.lexer`, paragraph
splits for TXT / pasted), chunk at ~2000 chars (6000 max), embed via
`text-embedding-3-small`, and upsert into the unified `corpus_chunks`
table with `source_type='knowledge'`. UI lives at `/knowledge` (tabs:
upload file / paste text + title + source_label) and
`/knowledge/[id]` (parsed chunks with page/section citations).

**Smoke test (2026-05-16):** pasted a 1.2KB skincare positioning
snippet (`ee328496`); pipeline ran in 1.8s, produced one
`pasted_block` chunk, status reached `embedded`. Cross-source
similarity check: the knowledge chunk's top neighbour is the
`male_creator_relevance` chunk from video `5d44a1de` at 0.71 cosine
— exactly the field dedicated to that topic. Unified retrieval works.

**Fix migration 0006:** Slice 5's migration made the `corpus_chunks`
unique indexes partial (`where ... is not null`), which broke
supabase-js upserts with `ON CONFLICT` — Postgres rejects the conflict
target when only a partial unique index matches. Reverted both indexes
to non-partial. The `corpus_chunks_one_source` CHECK + Postgres' NULLs-
are-distinct semantics keep the invariants correct without the
predicate.

**Last updated:** 2026-05-16 (Slice 5 ship)

## Read these in order

1. **`SPEC.md`** — the brief. Positioning, scope, locked decisions. Doesn't change often.
2. **`PLAN.md`** — the v0 implementation plan with all nine pre-code fixes already patched in. This is the build instruction. **Read this fully before writing any code.**
3. **This file** — current state + next action.

If you only have time for one: `PLAN.md`.

## What's locked (don't re-litigate)

- **Project lives at** `~/Projects/TikTok/skincare-scripter` (new top-level workspace, alongside `Travel/`, `Instagram/`, `Creatify/`, `MissAffiliate/`, `Personal/`)
- **Audience:** Cameron only. No auth, no multi-tenant, no billing for v0.
- **Order:** video analysis built before script generator. Script generator is Phase 2.
- **Stack:** Next.js 16 App Router, Supabase (new project — do **not** reuse the Destinations by Lauren one), Vercel Fluid, shadcn/ui
- **Transcription:** Groq Whisper turbo (`whisper-large-v3-turbo`). Claude does not accept native audio.
- **Vision + analysis:** Claude Sonnet 4.6 (`claude-sonnet-4-6`)
- **Embeddings:** OpenAI `text-embedding-3-small` (1536 dims), defended in PLAN §6
- **Video intake:** manual MP4 upload only — no `yt-dlp`, no TikTok scraping
- **Knowledge intake:** PDF / MD / TXT / pasted text
- **Pipeline triggering:** `POST /api/videos` runs `processVideo()` via `after()` from `next/server` in the same function lifetime, `maxDuration = 800`. Do **not** use a fire-and-forget `fetch` to a separate route.
- **Dedup:** sha256 computed server-side as STEP 0 of pipeline, not in the browser.

## What's still open (Cameron decides before / during Slice 1)

Numbered list straight from `PLAN.md` "Risks & open questions" section. My recommended defaults shown — change if any of these aren't right:

1. ~~**Vercel plan**~~ — Resolved. Team is on **Pro** (Plus). The pricing assumption in PLAN.md ("Pro buys free Vercel Authentication") turned out to be partly wrong — see "Vercel Standard Protection alias gap" below.
2. **Frame budget** — start at 15 for ≤60s videos, 25 absolute max
3. **PDF parser** — `unpdf` (preserves page boundaries for citation)
4. **pgvector index** — hnsw (Supabase Postgres supports it)
5. **Embedding dim lock-in** — accept 1536 (re-embedding on provider switch is cheap at this scale)
6. **Timestamp validation** — clamp out-of-range to `[0, duration]` and warn (don't fail the breakdown)
7. **Empty-audio** — already handled in the system prompt (B-roll-only videos derive from frames)
8. **Dedup on re-upload** — reject duplicates; manual delete to override
9. **Frame retention** — keep all extracted JPGs; revisit when Storage bill bites
10. **Source-trust weights** — hardcoded map in `lib/search/trust.ts` for v0; promote to DB in Phase 2

## Slice plan (from `PLAN.md` §9)

| # | What ships | Status |
|---|---|---|
| 1 | Smallest E2E: upload one MP4, see one breakdown. Vercel access protection enabled before first deploy. | **shipped ✓** |
| 2 | Transcripts, frames, auto-trigger from upload | **shipped ✓** (auto-trigger was already in Slice 1; persistence + study-tool UI added) |
| 3 | Idempotent pipeline + status tracking + retry button | **shipped ✓** (step gates + STEP 0 sha256 dedup; both smoke tests verified) |
| 4 | Embeddings + similar-videos panel | **shipped ✓** |
| 5 | Knowledge ingestion (PDF/MD/TXT/pasted) | **shipped ✓** |
| 6 | Unified search across both corpora | not started |
| 7 | Polish (editable metadata, niche tags, clickable timestamps) | not started |

## Next concrete action

**Start Slice 6: unified search.** Per `PLAN.md` §8, this slice:
- New `/search` page with a single semantic-search input + filter
  pills (source_type all/video/knowledge, niche_tag, source_label).
- `lib/search/query.ts`: embed the query, run
  `select ... from corpus_chunks order by embedding <=> $1 limit 30`
  filtered by pills, then re-rank in-app with the weighted score
  from PLAN §8 (cosine + recency + virality + source_trust).
- `lib/search/trust.ts`: hardcoded source-label trust weights.
- Result cards: snippet + source-type badge + citation
  (`source_label · p.N · section` for knowledge, `filename @ t_start`
  for videos) + similarity %.
- Video result → `/videos/[id]?t=<t_start>` jumps player to moment.
- Knowledge result → `/knowledge/[id]?chunk=<id>` highlights chunk.

Open follow-ups (non-blocking):

1. **Breakdown quality regression** — the breakdown produced for video
   `5d44a1de` (Slice 3 code) was noticeably less detailed than
   `611cdcaa` / `d21d7f8b`. Diff `raw_claude_response` across the three
   breakdown rows, check model/max_tokens/prompt version, look for
   truncation indicators. (`611cdcaa` is now `status='duplicate'` after
   the Slice 4 smoke test, but its breakdown row still exists.)
2. **`corpus_chunks` partial-write within STEP 4 / knowledge embed** —
   if the embed step crashes after some rows land, the gate ("any row
   exists for {video_id|knowledge_item_id}") skips it on retry and the
   item has incomplete embeddings. Acknowledged in Slice 4 + 5;
   promote to a per-`chunk_kind` gate or transactional RPC if this
   bites.
3. **Knowledge chunker uses char proxy (~2000 chars / ~500 tokens),
   not real tokens.** Cap at 6000 chars (~1500 tokens worst case)
   keeps embedding inputs under the 8192 limit. If dense
   technical PDFs trip the cap or chunk density drifts,
   install `js-tiktoken` and switch to true token counts.
4. **`pipeline_status` enum is shared between videos and knowledge.**
   Knowledge items pass through `transcribed → embedded` even though
   they were never transcribed — the value just means "parsed." Adding
   a dedicated `parsed` enum value is heavy for a label-only change;
   live with the abuse for now.

## Slice 5 shipped — what landed

- **Migration `0005_slice5.sql`:** `knowledge_items` table (kind enum
  via CHECK: `pdf` | `md` | `txt` | `pasted`; row-level CHECK enforces
  `pasted` ⇔ `pasted_text NOT NULL ∧ storage_path NULL`, file kinds
  the inverse). Created `source_type` enum (`video` | `knowledge`),
  added `knowledge_item_id` FK + `page_number` + `section_label` +
  `source_type` columns to `corpus_chunks`, backfilled existing video
  rows, added `corpus_chunks_one_source` exclusivity CHECK. New
  `knowledge` storage bucket (private, 50MB per-file cap,
  `application/pdf` + `text/markdown` + `text/plain` MIME allowlist).
- **Migration `0006_corpus_chunks_unique_full.sql`:** fix for an
  ON CONFLICT bug 0005 introduced (partial unique indexes can't be
  inferred as conflict arbiters by supabase-js). Both
  `corpus_chunks_*_unique` indexes are non-partial; CHECK + NULLs-
  distinct semantics keep the invariant correct.
- **`lib/pipeline/knowledge.ts`:** `processKnowledge({knowledgeItemId})`.
  Parsers: `unpdf.extractText({mergePages: false})` for PDFs
  (page boundaries → `page_number`), `marked.lexer` walked with a
  "last heading seen" cursor for MD (heading text → `section_label`),
  blank-line paragraph splits for TXT and pasted. Char-based packer
  greedily fills ~2000 chars per chunk (6000-char cap; sentence-aware
  split on oversize), preserving first page + first section in each
  chunk. Single OpenAI batch embed → upsert with ON CONFLICT
  DO NOTHING. Status flow: `uploaded → transcribed → embedded`.
- **API routes:** `POST /api/uploads/sign-knowledge` (skips MIME
  validation — client sends `kind`, bucket allowlist is the backstop),
  `POST /api/knowledge` (`maxDuration=300`, mirror of video route's
  try/catch → failed-status handler), `POST /api/knowledge/[id]/retry`
  (same pattern as video retry).
- **UI:** `/knowledge` page with tab toggle (upload file / paste text)
  + optional title + source_label inputs + recent items list.
  `/knowledge/[id]` shows parsed chunks with `p.N · section` citation
  + retry button + auto-refresh while status is non-terminal. Home
  page now has a `Knowledge →` link.
- **Scripts:** `npm run process-knowledge <id>` for headless pipeline
  runs (mirror of `process-video`).
- **Deps added:** `unpdf`, `marked`.

## Slice 4 shipped — what landed

- **Migration `0004_slice4.sql`:** `vector` extension; `corpus_chunks`
  table (video-only, no `source_type` yet — Slice 5 ALTERs); hnsw
  cosine index on `embedding`; partial unique
  `(video_id, chunk_kind, chunk_index)`; `similar_videos(target_id,
  k)` SQL function returning `(video_id, similarity, filename,
  niche_tag, first_frame_path)`.
- **Pipeline STEP 4:** `lib/pipeline/video.ts` embeds each
  `transcript_chunks` row + one chunk per non-empty breakdown facet
  (`breakdown_summary`, `male_creator_relevance`, `buyer_psych_levers`,
  `pacing_notes`, `visual_style_notes`) via OpenAI
  `text-embedding-3-small`. Insert is
  `upsert(..., onConflict: 'video_id,chunk_kind,chunk_index',
  ignoreDuplicates: true)`. Sets `status='embedded'` on success.
- **Status flow fix:** STEP 3 now sets `status='analyzed'` inside its
  own block; the final unconditional update now only clears
  `error_message` (no status). Resume on an embedded video stays
  embedded.
- **UI:** new `app/videos/[id]/similar-videos.tsx` server component
  rendering up to 5 thumbnail cards (signed URL TTL = 1h). Page only
  fetches + renders when `video.status === 'embedded'`. Empty result
  shows "No similar videos yet — embed at least one other video to
  compare."

Embedding values are stored as `JSON.stringify(number[])` for
pgvector (Supabase canonical pattern; raw JS array also works via
PostgREST but the stringified form is unambiguous).

## Supabase project (this project, NOT DBL)

- ref: `yajpzqbrclsxhljialqs`
- region: us-west-1
- URL: `https://yajpzqbrclsxhljialqs.supabase.co`
- bucket: `videos` (private, 500MB per-object limit). **Project-level upload limit was bumped to 500MB via dashboard** — required for files >50MB (Pro default).

## Vercel Standard Protection alias gap (resolved by `proxy.ts`)

Discovered during the first deploy: on Pro plan, Vercel "Standard Protection" via `ssoProtection.deploymentType: "all"` is **rejected by the API** with `"Vercel Authentication is not available on your plan for production deployments"`. Only the looser `"prod_deployment_urls_and_all_previews"` is accepted — and it leaves the production alias (`skincare-scripter.vercel.app`) **publicly reachable**. To fully gate the alias you need Advanced Deployment Protection (paid add-on, not on Pro).

Fix: Basic Auth in `proxy.ts` (Next 16). One env var `APP_PASSWORD`, fail-closed (503 if env var missing). Browser handles the login UI via `WWW-Authenticate: Basic`. SSO Protection on previews is still enabled — belt and suspenders.

If a custom domain is added later, the proxy still works on it — no Vercel-side reconfiguration needed.

## Vercel project + deploy

- Project: `skincare-scripter` (id `prj_4wSYPz1D02PYs47QS6r61QFSyrYC`) under team `kikuchicameron-7255's projects`
- Production URL: https://skincare-scripter.vercel.app
- GitHub: https://github.com/kikcam-cmd/skincare-scripter (private, push → auto-deploy)
- Pipeline trigger: `POST /api/videos`. Function `maxDuration` is set to 800 in the route — Pro plan allows up to 800s under Fluid Compute. **Project default is still 300s; route-level override is what gives us 800.**

## Known issues / Slice 1 deferrals

- ~~**Pipeline is single-shot, not idempotent.**~~ **Slice 3 ✓** — DB-existence-gated, retry resumes without re-billing completed steps.
- ~~**No transcripts/frames persistence.**~~ **Slice 2 ✓** — both persisted, retry cleans them up.
- ~~**No dedup.**~~ **Slice 3 ✓** — STEP 0 hashes the MP4 server-side; duplicates of prior successful uploads are marked `status='duplicate'`.
- **Partial-write within a step is the remaining sharp edge.** If STEP 1 inserts the `transcripts` row but the `transcript_chunks` insert fails, retry skips STEP 1 (transcripts row exists) and STEP 3 reads zero chunks. Rare in practice; if it happens, the user has to manually delete the half-written `transcripts` row from the Supabase dashboard. A proper fix would be per-step upserts or a transactional RPC. Same edge case shape applies to STEP 4 (`corpus_chunks`).
- **`videos` bucket needs `image/jpeg` in `allowed_mime_types`.** Frames live at `videos/frames/<id>/NN.jpg`; without this the bucket rejects frame uploads with `mime type image/jpeg is not supported` and STEP 2 fails. Set by dashboard SQL on 2026-05-16. Not in any migration file — re-apply manually on any fresh Supabase project: `update storage.buckets set allowed_mime_types = array['video/mp4','video/quicktime','video/webm','image/jpeg'] where name='videos';`.
- ~~**Dedup STEP 0 silently no-op'd.**~~ **Fixed 2026-05-16** — the original partial unique index on `content_hash` forbade the duplicate-row update, and the supabase-js call swallowed the error. Migration 0003 widens the predicate to `WHERE content_hash IS NOT NULL AND status <> 'duplicate'`; STEP 0 updates now throw on error so a future schema/constraint mismatch lands the row in `status='failed'` instead of stalling at `uploaded`.
- **`max_tokens=4000`** for Claude breakdown (bumped from 2000 after first run truncated `male_creator_relevance`). If future runs still truncate, raise further.
- **Frame extraction is still evenly-spaced** via per-frame `-ss` seek, not the hybrid scene-detect from PLAN §4. Deferred — promote if breakdown quality suffers on longer/montage-heavy videos.
- **No "hard reset" button.** Retry resumes; there's no UI to force a full re-run from scratch. If you need it, manually delete the breakdown/transcripts/key_frames rows in the dashboard.

## Required env vars

```
NEXT_PUBLIC_SUPABASE_URL=          # set in .env.local
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # set
SUPABASE_SERVICE_ROLE_KEY=         # set
ANTHROPIC_API_KEY=                 # set
GROQ_API_KEY=                      # set
APP_PASSWORD=                      # Basic Auth gate (proxy.ts). Required — app returns 503 if missing.
OPENAI_API_KEY=                    # set (Slice 4 embeddings)
```

## Local dev quick reference

```bash
npm run dev                                          # next dev (port 3001 if 3000 busy)
npm run process-video <video-uuid>                   # run pipeline standalone without HTTP
npx tsc --noEmit                                     # type check
npx next build                                       # catch deploy-time issues
```

## Git history

```
<this commit> End-of-session save: capture key-rotation todo + Slice 4 entry state
28ceb14 Fix Slice 3 dedup unique-index + surface STEP 0 update errors
df6fa74 Record Slice 4 pause point in STATUS.md
006660e Ship Slice 3: idempotent pipeline (step gates + STEP 0 sha256 dedup)
5f29e55 Ship Slice 2: transcripts/frames persistence + study-tool UI
b531024 Record Slice 1 Vercel deploy in STATUS.md
ebb4094 Gate deployment with Basic Auth proxy
66f5123 Ship Slice 1: MP4 upload to Claude breakdown pipeline
cc02a51 Add STATUS.md as session-handoff doc
1a42593 Patch PLAN.md with five smaller cleanups
9095a38 Patch PLAN.md with four pre-code fixes
0385f65 Add v0 implementation plan from /ultraplan
f89df31 Initial v0 spec for skincare-scripter
```

## Out of scope for v0 (do not build)

- Script generator (Phase 2)
- Performance feedback loop (Phase 3)
- Auth, multi-tenant, billing (Phase 4 if ever)
- TikTok URL scraping, `yt-dlp`, or TikTok API integration

## Updating this file

End of every working session, update the **Where we are** line, the **slice status table**, and the **Next concrete action** section. Don't let it rot.
