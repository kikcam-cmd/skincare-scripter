# Status

Rolling session-handoff doc. Read this first when picking up the project — it points at the source-of-truth files and tells you exactly what to do next. Update it at the end of every working session.

---

## Where we are right now

**Phase:** **v0 (Slices 1–7) shipped on prod. Slice 8 brain-quality
landed in code + migration 0010 applied to DB — code needs commit +
deploy + backfill of 3 existing videos. Phase 2 script-gen surface
deferred until corpus grows (Cameron uploading more material first).**

Slice 8 reframe (2026-05-17): Cameron's pivot during PLAN_PHASE2 §2
discussion — *"perfect the brain"* before building the script-gen
surface. PLAN_PHASE2 §2's three open questions are surface-level (auth,
drafts, form contract) and don't move retrieval quality. With only 3
embedded videos and `view_count`/`posted_at` NULL across all of them
(virality + recency components scored 0 today), the binding constraint
is corpus size and structured retrieval keys — not the script-gen UX.

**What landed in Slice 8 (code, not yet deployed):**

- Migration `0010_brain_quality.sql` applied to prod DB (yajpzqbrclsxhljialqs).
- New `videos` columns: `product_category text[]` (widened from text in
  0011 — Cameron's feedback: products legitimately fit multiple categories,
  TikTok shop's classification often differs from functional category),
  `active_ingredients text[]`, `function_claims text[]`, `gmv_usd numeric`,
  `items_sold integer`.
- Breakdown prompt extracts the three structured product axes with
  sharp INCI vs end-user-outcome guidance (Cialdini-trained rule: when
  unsure, prefer function_claims, leave ingredients empty).
- Pipeline persists the new fields in STEP 3; STEP 4 gains `tonality`
  and `authenticity_signals` as new `chunk_kind` retrieval surfaces
  (tonality moved out of breakdown_summary; authenticity_signals was
  orphan-extracted in v0 — now retrievable).
- `search_corpus` RPC gains 4 new filter params (`p_product_category`,
  `p_active_ingredient`, `p_function_claim`, `p_tonality`) and projects
  6 new columns (video_product_category, video_active_ingredients,
  video_function_claims, video_gmv_usd, video_items_sold, video_tonality).
- `/search` page gets 4 new filter pill rows; upload form + inline
  metadata editor accept the new fields.
- Ranker (`lib/search/rank.ts`) carries gmv_usd + items_sold in
  `RankInput` but **finalScore formula unchanged** — tuning weights on
  3 videos with NULL analytics is noise. Real ranker pass deferred until
  ~20+ videos with real GMV exist.
- Knowledge corpus cleanup: Cialdini PDF (knowledge_item `6898187f`)
  retitled to "Influence: The Psychology of Persuasion" with source_label
  "Cialdini - Influence". Pre-pivot "Male creator skincare positioning
  (notes)" item (knowledge_item `ee328496`) deleted along with its 31
  corpus_chunks. `source_trust` flattened — Hormozi stub label removed,
  personal-notes weight set to 1.0. Cameron's stance: all knowledge
  trusted equally for script-gen; the lever stays for later.
- Backfill runbook for the 3 existing embedded videos written at
  `db/backfill/0010_backfill_runbook.md`. Insurance dump captured in
  the session transcript; Supabase PITR covers 7-day rollback.

**Corpus state at 2026-05-17:** 3 embedded videos (`d21d7f8b` Medicube
Mud Mask, `5d44a1de` Dr. Melaxin Lip Plumper, `d5240f30` Dr. Melaxin
Calcium Multi Balm — STATUS had previously said 2, was stale by one
upload), 1 failed (`6cae114c` screen recording), 2 duplicates. 1
embedded knowledge item (Cialdini's *Influence*, now properly labeled).
Every video has `view_count` + `posted_at` NULL today → ranker virality
+ recency components score 0 across the board until Cameron supplies
analytics.

**Pre-Phase-2 code audit (2026-05-17):** ran a comprehensive health check
across security / pipeline / code quality. 1 fix shipped immediately
(timing-safe Basic Auth compare in `proxy.ts`); 8 findings deferred into
Phase 2 Slice 1's auth retrofit — see "Pre-Phase-2 audit findings" section
below for the full list with file:line refs. Not bundled into Slice 8.

**Last updated:** 2026-05-17 (Slice 8 brain-quality code + migration landed; pending commit/deploy/backfill)

## Read these in order

1. **`SPEC.md`** — the brief. Positioning, scope, locked decisions. Doesn't change often. SPEC's "Out of scope for v0 (future phases)" section is the Phase 2 starting point.
2. **`PLAN.md`** — the **v0** implementation plan (now historical). Carries a "partially superseded by Slice 5.5" banner; the architecture, pipeline shape, embedding choice, and search §8 are still accurate; the prompt content and breakdown schema have moved on.
3. **`PLAN_PHASE2.md`** — Phase 2 (script generator) planning doc, drafted 2026-05-17. Parametric on three open questions in its §2 — those resolve before any Phase 2 code. Once resolved, this file gets a Slice-5.5-style "decisions locked" banner and the slice plan in §8 fills in.
4. **This file** — current state + next action.

If you only have time for one when picking up v0 context: `PLAN.md`. For Phase 2 kickoff: `PLAN_PHASE2.md` + this file's "Next concrete action".

## What's locked (don't re-litigate)

- **Project lives at** `~/Projects/TikTok/skincare-scripter` (new top-level workspace, alongside `Travel/`, `Instagram/`, `Creatify/`, `MissAffiliate/`, `Personal/`)
- **Audience:** Ingestion is Cameron only (videos + knowledge). The Phase 2 script generator opens to affiliate creators (male and female); `target_creator_gender` becomes a request-time param on the script form at that point, alongside auth + a real users table. No auth, no multi-tenant, no billing in v0.
- **Order:** video analysis built before script generator. Script generator is Phase 2.
- **Stack:** Next.js 16 App Router, Supabase (new project — do **not** reuse the Destinations by Lauren one), Vercel Fluid, shadcn/ui
- **Transcription:** Groq Whisper turbo (`whisper-large-v3-turbo`). Claude does not accept native audio.
- **Vision + analysis:** Claude Sonnet 4.6 (`claude-sonnet-4-6`)
- **Embeddings:** OpenAI `text-embedding-3-small` (1536 dims), defended in PLAN §6
- **Video intake:** manual MP4 upload only — no `yt-dlp`, no TikTok scraping
- **Knowledge intake:** PDF / MD / TXT / pasted text
- **Pipeline triggering:** `POST /api/videos` runs `processVideo()` via `after()` from `next/server` in the same function lifetime, `maxDuration = 800`. Do **not** use a fire-and-forget `fetch` to a separate route.
- **Dedup:** sha256 computed server-side as STEP 0 of pipeline, not in the browser.

## v0 open questions from PLAN — all resolved during build

Numbered list from `PLAN.md` "Risks & open questions". Resolutions noted; left here as a history pointer for picking up v0 context. **None of these are open anymore.**

1. ~~**Vercel plan**~~ — Resolved. Team is on **Pro** (Plus). The pricing assumption in PLAN.md ("Pro buys free Vercel Authentication") turned out to be partly wrong — see "Vercel Standard Protection alias gap" below.
2. ~~**Frame budget**~~ — Settled at 15 for ≤60s, 25 absolute max.
3. ~~**PDF parser**~~ — `unpdf` (per-page boundaries → `page_number`).
4. ~~**pgvector index**~~ — hnsw cosine, indexed in migration 0004.
5. ~~**Embedding dim lock-in**~~ — Accepted 1536; `text-embedding-3-small` shipped.
6. ~~**Timestamp validation**~~ — Clamp-and-warn in breakdown prompt.
7. ~~**Empty-audio**~~ — Handled in system prompt; B-roll-only videos derive from frames.
8. ~~**Dedup on re-upload**~~ — STEP 0 sha256 marks duplicates; manual delete to override.
9. ~~**Frame retention**~~ — Keep all extracted JPGs (Storage bill not yet a problem).
10. ~~**Source-trust weights**~~ — Promoted to DB table in Slice 7 (migration 0009); admin UI at `/trust`.

## Slice plan (from `PLAN.md` §9)

| # | What ships | Status |
|---|---|---|
| 1 | Smallest E2E: upload one MP4, see one breakdown. Vercel access protection enabled before first deploy. | **shipped ✓** |
| 2 | Transcripts, frames, auto-trigger from upload | **shipped ✓** (auto-trigger was already in Slice 1; persistence + study-tool UI added) |
| 3 | Idempotent pipeline + status tracking + retry button | **shipped ✓** (step gates + STEP 0 sha256 dedup; both smoke tests verified) |
| 4 | Embeddings + similar-videos panel | **shipped ✓** |
| 5 | Knowledge ingestion (PDF/MD/TXT/pasted) | **shipped ✓** |
| 5.5 | Metadata pivot: brand/product/gender/notes/ai_tags + neutral breakdown | **shipped ✓** |
| 6 | Unified search across both corpora (now uses creator_gender/brand/product/ai_tags filters) | **shipped ✓** |
| 7 | Polish (editable metadata, niche tags, clickable timestamps) | **shipped ✓** (deep links + editable metadata + clickable timestamps + DB-backed trust UI all landed) |
| 8 | Brain quality: structured product axes (product_category / active_ingredients / function_claims), GMV/items_sold conversion columns, tonality + authenticity_signals as retrieval surfaces, knowledge corpus cleanup, trust flatten | **code + migration landed; pending commit/deploy/backfill** |

## Next concrete action

**Three sequential moves, in order:**

1. **Commit + deploy Slice 8 code.** Migration is already on prod DB,
   but the code (prompt, pipeline, RPC clients, upload form, /search,
   metadata editor) lives only in working tree. Run typecheck before
   deploy (already passes locally as of writing).

2. **Backfill the 3 existing embedded videos** under the new prompt
   per `db/backfill/0010_backfill_runbook.md`. Without backfill, the
   structured product fields stay empty on those rows and they won't
   surface under `product_category` / `active_ingredient` filter pills
   even though embeddings already exist. Backfill regenerates
   breakdowns + corpus_chunks; transcripts + key_frames are kept
   (idempotency gates skip STEP 1 + STEP 2).

3. **Cameron uploads more material.** SPEC said the brain learns from
   videos + buyer-psych knowledge; v0 + Slice 8 built the *machine*,
   but the brain is only as good as the corpus inside it. Upload
   target before returning to Phase 2 script-gen: ~20+ videos so the
   ranker formula pass (deferred from Slice 8) has signal to tune
   against. As corpus grows, watch for filter dimensions that should
   graduate to structured fields (per
   [[feedback-skincare-scripter-filter-suggestions]] — flag them
   proactively with evidence).

**Phase 2 script-gen surface (PLAN_PHASE2) stays deferred** until brain
is demonstrably good. The three load-bearing §2 questions
(multi-tenancy, auth provider, script contract) are now better-informed
by the brain-quality work but don't unblock until corpus + retrieval
quality clears a "this is worth wrapping a script-gen surface around"
bar. Re-engage when Cameron has ~20 videos in and an `/search` query
for a representative request returns the right grounding material.

Already pre-decided in PLAN_PHASE2 (no Cameron action needed):
- §2.4 `proxy.ts` disposition — keep as outer gate during invite-only
  beta, remove in a dedicated cutover slice after real auth is verified
- §2.5 `target_creator_gender` — `profiles` default + per-request override
- §2.7 Pricing — invite-only beta, Cameron eats cost, Sonnet 4.6 throughout
- §2.8 Phase 3 perf feedback stays out of Phase 2

Open follow-ups from v0 (non-blocking, all could roll into Phase 2 if
they bite):

1. ~~**Breakdown quality regression for 5d44a1de**~~ — resolved by the Slice 5.5 backfill. Both surviving embedded videos (5d44a1de + d21d7f8b) were re-analyzed under the new prompt and shipped with rich, comparable breakdowns. `611cdcaa` still carries its original Slice 3 breakdown row (status='duplicate', not surfaced), but the comparison no longer matters because the prompt + schema have changed underneath it.
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
5. **HNSW + WHERE-filtered search may return <k candidates** when filter
   pills are highly selective: pgvector's HNSW walks the graph then
   filters, so a `limit 30` post-filter can drop below 30 rows. Invisible
   at current corpus size (2 videos + a few knowledge items); revisit if
   filtered searches start returning thin result lists.
6. ~~**Slice 6 deep-link URLs emit `?t=N` / `?chunk=N` but detail pages
   don't read them**~~ — resolved in Slice 7 partial: StudyTool now
   seeks on mount, knowledge page scrolls + highlights the matching
   chunk.

## Pre-Phase-2 audit findings (2026-05-17)

Comprehensive health audit ran after v0 close-out. One fix shipped in
`b08c448`; the rest fold into Phase 2 Slice 1's auth retrofit (see
`PLAN_PHASE2.md` §8 Slice 1). Hallucinated findings (proxy.ts "not wired",
metadata denorm inconsistency) were verified false against the code and
dropped — not listed here.

**Done:**
1. ~~**Basic Auth timing-side-channel in `proxy.ts:18`**~~ — fixed in
   `b08c448`. `password === expected` replaced with
   `crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expected))`
   guarded by length check. Soft threat model (HTTPS, single shared
   password, network jitter dominates) but the fix was one line.

**Fold into Slice 1 (auth retrofit):**

2. **Raw Supabase errors leak to client.** Every API route returns
   `error.message` directly — e.g. `app/api/videos/[id]/route.ts:61`,
   `app/api/videos/route.ts:61`, `app/api/knowledge/route.ts`. Schema
   details leak. Switch to `console.error()` + generic 500.
3. **Full stack traces written to `videos.error_message`** —
   `app/api/videos/route.ts:71` (`${err.message}\n${err.stack}`).
   Renders on the video detail page. Truncate to first line or first
   200 chars.
4. **`posted_at` validation gap** — `app/api/videos/[id]/route.ts:49`:
   `nullIfEmpty(body.posted_at)` just trims and passes through. Add
   `^\d{4}-\d{2}-\d{2}$` regex + `Date.parse` round-trip.
5. **Two avoidable `createAdminClient()` calls in
   `app/videos/[id]/page.tsx`** — `allMeta` distinct-values query
   (line 86) and `similar_videos` RPC (line 143) use service_role
   where the server client (anon) would work. Cosmetic today (RLS is
   off), but silently bypasses Phase 2 RLS once added. Signed-URL
   generation on line 59 correctly stays on admin.
6. **No rate limiting on POST routes** — `/api/uploads/sign*`,
   `/api/videos`, `/api/knowledge`. Mitigated today by proxy.ts (every
   caller is already authenticated). Becomes a real issue with
   multi-user — one affiliate can DoS Vercel function budget for
   everyone. Add per-user limits once auth is in place.

**Pattern risks (do as part of Phase 2 Slice 0 / Slice 1):**

7. **Hand-rolled type casts in data fetches** — `as string`, `as number`,
   `as Record<string, unknown>` scattered across
   `app/videos/[id]/page.tsx`, `app/trust/page.tsx`,
   `lib/search/query.ts`. v0 absorbs it; Phase 2 will add
   `script_drafts` queries, paginated lists, citation rendering, and
   the casting surface grows fast. Run `supabase gen types typescript`
   and import the generated types. ~30 min, retires the pattern.
8. **No `app/error.tsx` global boundary.** Unhandled RSC throws surface
   as Next's generic error page. Add a styled `error.tsx` + per-route
   `error.tsx` for `/scripts/*` when that lands.
9. **`searchParams` parsing repeated** across `/search`, `/videos/[id]`,
   `/knowledge/[id]` (each hand-parses `parseInt(sp.x, 10)`). The
   script-gen route will do the same. Extract a `parseSearchParams`
   helper in `lib/` before the fourth instance lands.

**Verified clean** (so the next session doesn't re-audit these):
`proxy.ts` IS correctly wired (Next 16 renames middleware→proxy);
`corpus_chunks.metadata` denormalization IS consistent (pipeline writes
3 fields, PATCH propagates same 3, RPC LEFT JOINs videos for the rest);
idempotency gates, migration hygiene, FK cascades, unique-index strategy,
`search_corpus` RPC, citation-schema readiness for Phase 2 — all clean;
server/client component boundaries clean; no path-traversal / CORS /
secret-leakage risks.

## Slice 6 shipped — what landed

- **Migration `0008_search_corpus.sql`:** `search_corpus(query_embedding,
  p_source_type, p_niche_tag, p_source_label, p_creator_gender, p_brand,
  p_product_name, p_ai_tag, k)` RPC. LEFT JOIN `videos` + `knowledge_items`
  so the caller gets parent metadata (filename, brand/product/gender,
  ai_tags, view_count, posted_at; title/kind/source_label) in one round
  trip. Filters compile away when null (`p_X is null or col = p_X`).
- **`lib/search/trust.ts`:** hardcoded `source_label → weight` map, default
  1.0. Stub entries: Hormozi=1.2, personal notes=0.7. (Superseded in
  Slice 7 — promoted to `source_trust` DB table earlier than the
  PLAN-§8 "Phase 2" plan called for.)
- **`lib/search/rank.ts`:** pure ranking. `finalScore = similarity +
  0.05·recency + 0.08·virality + 0.05·trust`. Recency uses the parent
  row's date (`videos.posted_at` ?? `videos.created_at`, or
  `knowledge_items.created_at`) so re-embedding doesn't reset recency.
  Virality is `log10(view_count)/7` for videos only; trust is the
  normalized source_label weight for knowledge only.
- **`lib/search/query.ts`:** `searchCorpus(query, filters)` embeds via
  `text-embedding-3-small`, calls the RPC with `k=30`, re-ranks in-app,
  returns top 10. `loadFilterOptions()` reads distinct values from
  `videos` + `knowledge_items` to populate the pill rows.
- **`/search` page (`app/search/page.tsx`):** server component reading
  `searchParams` (Next 16's async Promise shape). Native `<form
  method="GET">` so URL state drives everything — pill toggles are
  `<Link>` hrefs that mutate one key and preserve the rest. Result cards
  emit deep-link URLs (videos: `/videos/[id]?t=N`, knowledge:
  `/knowledge/[id]?chunk=N`). Citation format: `brand · product · @m:ss`
  for videos, `source_label · p.N · section` for knowledge.
- **Nav (`app/layout.tsx`):** header gains Upload / Knowledge / Search.
- **Smoke test (executed against prod DB via Supabase MCP):**
  self-similarity round-trip = 1.0000, neighbor ordering correct,
  `p_brand='Medicube'` filter restricts to that brand's chunks only.
- **UX gotcha to be aware of:** typing in the search input and then
  clicking a filter pill (without first submitting the search) discards
  the typed text — pills are `<Link>` hrefs that navigate immediately.
  Once a query is in the URL (`?q=...`), pill toggles preserve it
  correctly. Fix would need a small client component to read the input
  value into the pill href on click. Left as a v0 quirk.


## Slice 5.5 shipped — what landed

- **Migration `0007_metadata_pivot.sql`:** new `creator_gender` enum
  (`male`/`female`/`unknown`); `videos` gains `creator_gender`
  (NOT NULL, default `'unknown'`), `brand`, `product_name`,
  `user_notes`, `ai_tags text[]` (NOT NULL, default `'{}'`);
  `breakdowns` drops `male_creator_relevance`, adds nullable
  `gender_specific_notes`. Pre-emptively deletes orphaned
  `corpus_chunks` rows where `chunk_kind = 'male_creator_relevance'`.
- **Prompt rewrite (`lib/prompts/breakdown.ts`):** SYSTEM_PROMPT
  rewritten gender-neutral; instructs Claude to fill
  `gender_specific_notes` only when a beat materially depends on
  creator gender. Tool schema swaps `male_creator_relevance` for
  `gender_specific_notes` (string|null) and adds `ai_tags`
  (array of strings; lowercase-hyphen-separated freeform tags
  spanning product category, audience, format, use case). Metadata
  block passed to Claude now includes brand, product, creator
  gender, and optional user notes.
- **Pipeline (`lib/pipeline/video.ts`):** STEP 3 persists
  `gender_specific_notes` to breakdowns and updates
  `videos.ai_tags` in the same status='analyzed' update. STEP 4
  swaps `male_creator_relevance` chunk for `gender_specific_notes`
  (skipped when null). **Also fixed pre-existing bug:**
  `corpus_chunks` insert now sets `source_type: 'video'` (NOT NULL
  since Slice 5, but Slice 5's pipeline edit missed the video path).
- **Upload form (`app/(upload)/upload-card.tsx`):** dropzone gained a
  metadata strip — brand, product, creator gender (3-button toggle),
  and optional notes textarea — all sent through to `POST /api/videos`.
- **Video detail (`app/videos/[id]/page.tsx`):** new compact
  metadata card surfaces brand/product/gender/notes/ai_tags;
  breakdown summary renders `gender_specific_notes` only when set.
- **SPEC.md rewrite:** positioning, ingestion description, and
  breakdown JSON shape updated to match the pivot. Out-of-scope
  list updated to reflect Phase 2 multi-tenant (script generator
  for affiliates) instead of "no multi-tenant ever."
- **Backfill:** 2 surviving videos re-analyzed with brand/product/
  gender pre-seeded via SQL. Both shipped with rich `ai_tags`
  (10 each) and substantive `gender_specific_notes`.

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
  (`breakdown_summary`, `male_creator_relevance` *— renamed to
  `gender_specific_notes` in Slice 5.5*, `buyer_psych_levers`,
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
- **`max_tokens=4000`** for Claude breakdown (bumped from 2000 originally; verified to leave headroom for ai_tags + gender_specific_notes). If future runs truncate, raise further.
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

`git log --oneline` is the source of truth. (Previous embedded snapshot
got out of date by Slice 5 and was removed — the per-slice "what landed"
sections below capture the substantive history.)

## Out of scope for v0 (do not build)

- Script generator (Phase 2)
- Performance feedback loop (Phase 3)
- Auth, multi-tenant, billing (Phase 4 if ever)
- TikTok URL scraping, `yt-dlp`, or TikTok API integration

## Updating this file

End of every working session, update the **Where we are** line, the **slice status table**, and the **Next concrete action** section. Don't let it rot.
