# Status

Rolling session-handoff doc. Read this first when picking up the project — it points at the source-of-truth files and tells you exactly what to do next. Update it at the end of every working session.

---

## Where we are right now

**Phase:** v0 corpus + **Slice 9 products catalog + Slice 9.5 main_ingredients split + Slice 9 backfill** complete. **13 embedded videos across 4 brands and 12 products.** Pipeline is product-aware end-to-end: every upload picks a product from a dropdown, Whisper's transcription prompt biases on that product's canonical `main_ingredients`, and STEP 3 receives the canonical list as a spelling-correction reference (without permission to dump wholesale into per-video extraction). All 9 pre-Slice-9 videos backfilled with the new prompt + STEP 3 wording on 2026-05-29; the 4 same-day canaries were re-run after a one-line `Korean` addition to the Whisper static tail. **Phase 2 Slice 0 (script-gen prototype) is the next concrete build.**

**Architectural framing locked (2026-05-29):** the v0 surfaces (`/upload`, `/products`, `/knowledge`, `/search`) are the **backend brain** — corpus building, ingestion, introspection. `/search` is the brain inspector; literal-hook retrieval is its job, not a flaw. **Phase 2 is a separate UI surface** (`/scripts`) that consumes the brain via the `search_corpus` RPC but with its own retrieval shape (product-filtered, no chunk_kind weighting at the retrieval layer) and an LLM prompt with a **synthesize-don't-imitate constraint** — Cameron's frame: *"These uploads are for the Script-gen to learn what is working in the space to build a new strong viral script."* Literal hooks in the corpus are training material, not template content. The constraint lives at the prompt layer, not by filtering chunk_kinds out of retrieval.

**The earlier framing (empirical `/search` grounding test as the Phase 2 gate) was a category error** — `/search` retrieval quality is a corpus-health check (which passed: 9 of 10 results topical, healthy chunk_kind spread). Whether script-gen actually generates useful scripts is only answerable by building the script-gen surface and running it. Phase 2 §2.1 (multi-tenancy) and §2.2 (auth provider) don't need to resolve before a single-user prototype; §2.3 (script contract) is empirically resolved through prototype iteration.

**Why Slice 9 happened (2026-05-19):** Cameron flagged transcription misrecognitions on the new batch of uploads — Whisper was producing "Volufiline → Valofulin", "Dr. Melaxin → dr millexon", and similar drift on proper nouns + active-ingredient names. These misspellings contaminate transcript embeddings and feed into STEP 3's extraction. Two structural fixes shipped together:
1. **Products catalog** (`brands` + `products` tables, `videos.product_id` FK) replaces free-text brand + product_name fields with a dropdown picker. Stops typo drift, and gives every video a stable FK to canonical product data.
2. **Whisper prompt biasing.** Groq's `audio.transcriptions.create` accepts a `prompt` parameter (≤224 tokens) that conditions decoding on expected vocabulary. `lib/pipeline/whisper-vocab.ts` builds a natural-language prompt from the picked product's `main_ingredients` + brand + product name + a small static skincare-actives tail. STEP 3's metadata block also receives `canonical_ingredients` with precise prompt wording: *"use ONLY to disambiguate transcript misspellings, do NOT copy wholesale into active_ingredients[]"*.

**Slice 9.5 follow-up (same session):** the 91-INCI Dr. Melaxin Gifted Collagen Boost Set blew past Whisper's 224-token prompt budget and would have given Claude too much room to dump canonical names into per-video extraction. Split `products.ingredients` into:
- `main_ingredients text[]` — curated actives the pipeline biases on (≤15-20 typical)
- `ingredients text[]` — full INCI deck, used as fallback when main is empty so un-curated products still get some biasing

The /products edit page surfaces both with a "N main · M INCI · K videos" chip per product row.

**Corpus state at 2026-05-29 (post-backfill, post-canary re-run):**

| ID | Brand · Product | Views | Posted | GMV (USD) | Sold |
|---|---|---|---|---|---|
| `86c06b78` | Medicube · PDRN Pink Collagen Volume Multi Balm | 25.38M | 2026-04-14 | $520,370 | 27,650 |
| `d21d7f8b` | Medicube · Zero Pore Blackhead Mud Mask | 22.48M | 2026-04-27 | $62,020 | 3,250 |
| `ac8a89b6` | Dr. Melaxin · Gifted Collagen Boost Set | 13.82M | 2026-05-04 | $315,210 | 5,450 |
| `5d44a1de` | Dr. Melaxin · BP Spicule Plumping Lip Shot | 11.62M | 2026-04-02 | $130,010 | 7,660 |
| `23b2bbac` | Medicube · PDRN Pink Collagen Volume Multi Balm | 11.06M | 2026-03-22 | $202,880 | 12,650 |
| `67009846` | Medicube · PDRN Pink Collagen Volume Multi Balm | 10.67M | 2026-04-08 | $225,200 | 12,860 |
| `0ec8aa90` | Medicube · PDRN Pink Collagen Volume Multi Balm | 8.10M | 2026-04-20 | $204,530 | 10,870 |
| `d5240f30` | Dr. Melaxin · Calcium Multi Balm | 7.16M | 2026-03-14 | $139,430 | 8,040 |
| `6150d45c` | Medicube · PDRN Pink Collagen Volume Multi Balm | 5.87M | 2026-05-19 | $131,940 | 6,980 |
| `f5d9a290` | Dr. Melaxin · Calcium Dark Spot Eye Cream | 4.08M | 2026-01-18 | $113,050 | 5,420 |
| `5eb78489` | Dr. Melaxin · Peel Shot Keratin Care Kojic Acid Turmeric Spray | 3.79M | 2026-04-28 | $49,230 | 2,060 |
| `049d4efd` | Dr. Melaxin · Calcium Dark Spot Eye Cream | 2.53M | 2026-02-21 | $96,390 | 4,590 |
| `e2afe5c7` | Laka · Spicy Lip Plumper | 1.28M | 2026-05-14 | $45,690 | 3,180 |

All 13 carry Slice 8 chunk_kinds (`tonality`, `authenticity_signals`) and Slice 9 product-aware transcripts. Plus 1 failed (`6cae114c` screen recording) and 2 duplicates. 1 embedded knowledge item (Cialdini's *Influence*).

**Products catalog state at 2026-05-29: 4 brands × 12 products, 12/12 curated.** Cameron's stance on the curated products' empty `ingredients` (full INCI was effectively moved into `main_ingredients` during the curation pass): **intentional**. The full INCI deck has no retrieval purpose; only `main_ingredients` matters for biasing and Phase 2 script-gen surfaces.

The catalog has broadened past pure skincare during this curation pass:
- New brand **Dr. Dent** (Purple Teeth Whitening Strips) — oral care
- New Medicube product **Deodorant Vanilla & Pistachio** — body care

Both got short `main_ingredients` lists; the project's positioning may shift from "skincare-scripter" to "K-beauty-affiliate-scripter" if this trend continues. Flag, not action.

**Per-product `main_ingredients` cemented (cement-line) addition (2026-05-29):**
- `cemenrete` added to `Dr. Melaxin · Calcium Dark Spot Eye Cream` and `Dr. Melaxin · Calcium Multi Balm` after Cameron flagged that "Samerante" in transcripts is the phonetic spelling; canonical is `cemenrete`. The canary re-run validated **Cameron's principle: don't force the words in if Whisper can't find them.** Biasing nudged but did not coerce — `Samerante` / `Semerante` rendered correctly per actual audio on both eye-cream canaries (0 `cemenrete` substitutions). Apply this principle to future per-product biasing decisions.

**Pause point — what's done now:**
- ✓ Slice 9 backfill complete (9 videos re-embedded 2026-05-29). All 9 carry Slice 8 chunk_kinds (`tonality`, `authenticity_signals`) and Slice 9 product-aware transcripts. The Slice 8 runbook at `db/backfill/0010_backfill_runbook.md` is functionally subsumed.
- ✓ 4 canaries re-run against the post-`Korean`-static-tail code; 3/4 render "Korean" correctly. `f5d9a290` opening still drifts (`Cranes` → `Kareem's` — neither is canonical, but `Kareem's` is no longer the original miss); acoustic ambiguity Whisper won't bridge from prompt context alone.
- ✓ Insurance dump at `db/backfill/0012_pre_rerun.json` (the dropped pre-backfill values, in case any AI-derived field needs forensic comparison).
- ✓ Manual TikTok-shop category stamp `moisturizers-and-mists` on `d5240f30` re-applied post-backfill (Claude can't derive it from video content).

**Last updated:** 2026-05-29 (Phase 2 Slice 0 shipped + smoke-tested with 4 drafts; Slice 0.1 prompt fix for framework-lift + Slice 0.2 dual-password tester gate landed for invite-only beta)

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
- **Brand + product are FK-backed (Slice 9).** `videos.product_id` → `products` → `brands`. `videos.brand` + `videos.product_name` are denormalized cache columns; the products catalog is the single source of truth. New uploads + edits pick from `/products` — no free-text path. `/api/products/[id]` PATCH propagates renames to the cache on related `videos` rows. Slice 6 `search_corpus` RPC reads the cache (no RPC change at this layer).
- **Canonical product ingredients (Slice 9.5):** `products.main_ingredients[]` is the curated active list the pipeline biases on; `products.ingredients[]` is the full INCI deck (used as fallback when main is empty). Per-video `videos.active_ingredients[]` still captures what the creator actually says — distinct from the canonical product list.
- **Whisper prompt biasing (Slice 9):** STEP 1 calls Groq with a natural-language `prompt:` built from the picked product's brand + product name + `main_ingredients` (or `ingredients` if main empty) + a small static skincare-actives tail (`lib/pipeline/whisper-vocab.ts`). The same canonical list is passed to STEP 3's metadata block as `canonical_ingredients` with explicit spelling-correction-only wording. Do not pass the full INCI deck to Whisper — the 224-token prompt budget can't hold it.

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
| 8 | Brain quality: structured product axes (product_category[] / active_ingredients[] / function_claims[]), GMV/items_sold conversion columns, tonality + authenticity_signals as retrieval surfaces, knowledge corpus cleanup, trust flatten. Follow-ups: 0011 widened product_category to array + creator-claims prompt reframe; `&` → " and " UI normalize | **shipped ✓** (9984a11 + 8970ec79 + 7913d8d; original 3 still pre-Slice-8 — absorbed by Slice 9 backfill) |
| 9 | Products catalog (brands + products tables + videos.product_id FK) + Whisper prompt biasing via product.main_ingredients + STEP 3 canonical-ingredients spelling-correction guidance. /products admin page; upload form + inline editor pickers; PATCH route propagates cache. 9.5 follow-up: split products.ingredients into main_ingredients[] (curated actives) + ingredients[] (full INCI fallback). 9-video backfill + canary re-run + `Korean` static-tail polish (2026-05-29). | **shipped ✓** (bff8dd4 + f5026e0 + 2026-05-29 backfill; products curation 12/12; corpus clean) |

## Next concrete action

**Build Phase 2 Slice 0 — script-gen prototype.** Single-user testbed behind the existing `proxy.ts` Basic Auth gate. No auth retrofit, no `profiles` table, no multi-tenancy — those are pre-prod gates, not pre-testing gates. The whole point is to get a script-gen surface running so Cameron can iterate on retrieval shape + prompt wording empirically.

### Slice 0 scope (sketch — confirm contract with Cameron first)

- **Page:** `/scripts` (form) + `/scripts/[id]` (result). Form = product picker (reuse upload dropdown), creator_gender 3-button toggle, intent textarea ("viral hook ideas" / "before-after demo angle" / "comment-reply CTA" / free-text), Generate button.
- **API:** `POST /api/scripts/generate` — Node runtime, `maxDuration ~120`. Accepts `{ product_id, intent, creator_gender }`. Inserts `script_drafts` row (status='retrieving'), runs retrieval + Claude in same lifetime via `after()` from `next/server`, persists result.
- **Retrieval:** `searchCorpus(intent, { product_name, creator_gender })` from `lib/search/query.ts` — already supports product filter. Top-k = 20 (richer than `/search`'s 10). Knowledge chunks (Cialdini) included naturally via existing rank.
- **LLM:** Claude Sonnet 4.6, structured tool-call output. **Synthesize-don't-imitate prompt:** *"Ground in these patterns; do not reproduce any phrase verbatim; cite which video taught you which lever."* Same wording-risk shape as Slice 9's `canonical_ingredients` instruction — likely the load-bearing prompt design call.
- **Output shape (default candidate, confirm):** single structured script — hook / problem / twist / solution / cta + tonality + pacing_notes + visual_direction + ai_tags + citations[{ chunk_id, kind, text_excerpt }]. From PLAN_PHASE2 §2.3 candidate.
- **DB:** `script_drafts` migration (`0014_script_drafts.sql`) — drop the `owner_id` + RLS for prototype; add back when auth lands. Other columns per PLAN_PHASE2 §4.
- **Polish (later slices):** auth retrofit + audit cleanup (PLAN_PHASE2 §8 "real" Slice 1), variants, iterative refinement, proxy.ts cutover. None of that gates testing.

### Open non-blockers worth filing if surfaced during prototype iteration

- **Catalog broadening.** Dr. Dent + Medicube Deodorant push past pure skincare. If script-gen spans these, revisit positioning (skincare-scripter vs K-beauty-affiliate-scripter).
- **Filter-dimension graduates.** Per [[feedback-skincare-scripter-filter-suggestions]], watch the post-backfill `ai_tags` for clusters that should become structured filter dimensions (e.g. "nurse-creator-authority", "filler-dupe-positioning", "tiktok-shop-orange-card-cta" all repeat across 3+ videos).
- **Per-product structural-chunk density.** A product with low chunk count (1 video × N kinds) may not have enough pattern fuel to synthesize. Measure when iterating — informs which products the invite-only beta can launch with.
- **Residual Whisper drift (acceptable, document only).** `f5d9a290` opening still hears `Kareem's` instead of `Koreans` (acoustic ambiguity Whisper doesn't bridge); 1× `Mellaxin` slip on the same video. Cameron's principle: don't force.

---

**Already pre-decided in PLAN_PHASE2 (no Cameron action needed):**
- §2.4 `proxy.ts` disposition — keep as outer gate through Slice 0 + the invite-only beta, remove in a dedicated cutover slice after real auth is verified
- §2.5 `target_creator_gender` — `profiles` default + per-request override (Slice 0 skips the profile, just takes per-request)
- §2.7 Pricing — invite-only beta, Cameron eats cost, Sonnet 4.6 throughout
- §2.8 Phase 3 perf feedback stays out of Phase 2

**Resolved by Slice 0 framing (2026-05-29):**
- §2.3 input shape: **product picker + free-text intent + creator_gender override.** Structured-form-with-free-text-context hybrid. Pure structured form was the §2.3 recommendation; Cameron's articulation of real queries ("I want a script for Medicube's Multi Balm" / "viral hook ideas for the Spicy Lip Plumper") is structured-plus-intent, not pure structure.
- §2.3 output shape: **single structured script (Slice 0)**, variants deferred to a follow-up slice. Same v0-style "smallest E2E" discipline.

**Still gating (resolve when prototype validates the brain is good enough to open to real affiliates):**
- §2.1 multi-tenancy (likely Branch A — shared corpus, per-user drafts)
- §2.2 auth provider (likely Supabase Auth with OTP codes)
- §2.3 input refinement based on Slice 0 usage (intent chips vs free-text, etc.)

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

## Slice 9 shipped — what landed (2026-05-19)

**Why this slice:** Cameron flagged after uploading 6 new videos that Groq Whisper was producing systematic misspellings of proper nouns and active-ingredient names — `Volufiline → Valofulin`, `Dr. Melaxin → dr millexon`, etc. These contaminate transcript text, transcript embeddings, citation rendering, and STEP 3's per-video ingredient extraction. Free-text brand/product fields on the upload form also created drift (`Dr Melaxin` vs `Dr. Melaxin` etc.). Slice 9 fixes both structurally: a normalized products catalog stops typo drift on metadata, and Groq's `prompt` parameter biases the decoder on each product's canonical ingredient list.

### Migration `0012_products_catalog.sql`

Applied to prod via Supabase MCP. DDL:

- `brands(id, name unique, slug unique, created_at)`
- `products(id, brand_id FK, name, slug, ingredients[], product_category[], brand_claims[], source_url, notes, timestamps, unique(brand_id, slug))`
- `videos.product_id uuid` FK to `products` (`on delete set null`, nullable so the data migration can run before backfill + so missing-product uploads degrade to a generic Whisper prompt instead of crashing)
- `slugify(text)` helper function (lowercase, runs of non-alphanumeric → single dash, trim leading/trailing dashes)

Data backfill in the same migration: insert distinct brands + products from existing `videos.brand`/`videos.product_name` pairs, merge `active_ingredients` across same-product videos into `products.ingredients` (full INCI seed), set `videos.product_id` on all 9 embedded rows. A `do $$ begin ... raise exception ... end $$` block at the end aborts if any embedded video lacks `product_id` after the run.

`videos.brand` + `videos.product_name` stay as **denormalized cache columns** — Slice 6's `search_corpus` RPC reads them, so this layer has no RPC signature change. The new `/api/products/[id]` PATCH route is the single writer that propagates renames into both cache columns on related videos.

### Migration `0013_product_main_ingredients.sql`

Applied separately (Slice 9.5 follow-up — see below). One column: `products.main_ingredients text[] not null default '{}'`. No data migration; Cameron curates manually post-deploy.

### Pipeline rewire

- **STEP 1 (`lib/pipeline/video.ts`):** loads `videos.product` (via FK) and selects `main_ingredients` if non-empty, else `ingredients`. Calls `buildWhisperPrompt({brand, productName, productIngredients, userNotes})` from `lib/pipeline/whisper-vocab.ts`. Result passed as `prompt:` to `groq.audio.transcriptions.create`. Falls back to a generic prompt (brand/product still passed if present) when `product_id` is null.
- **STEP 3 (`lib/prompts/breakdown.ts`):** `metadata.canonical_ingredients` is the same list (passed once at the top of `processVideo`). `SYSTEM_PROMPT` gained a precise instruction block: *"The metadata block may include `canonical_ingredients` — the product's known INCI list from the catalog. Use it ONLY to disambiguate misspellings the transcriber may have produced... Do NOT copy the canonical list into `active_ingredients` wholesale — if the creator names 2 of 11 known ingredients, emit 2, not 11."* The advisor flagged this wording risk explicitly: without it Claude would either dump the full list or ignore it; the precise phrasing keeps it in spelling-correction lane only.

### Whisper prompt builder (`lib/pipeline/whisper-vocab.ts`)

Builds natural-language prompts (Whisper biases better on sentence form than comma lists). Format:

```
"This is a skincare product review for TikTok. The product is <brand>'s
<productName>. The product contains: <ingredient list, hyphens → spaces,
capped at 30 entries>. Context: <userNotes if present>. Common terms in
this niche: niacinamide, retinol, hyaluronic acid, salicylic acid,
glycolic acid, azelaic acid, vitamin C, ceramides, peptides, centella
asiatica, panthenol, allantoin, spicule, Volufiline, K-beauty, PDRN,
collagen."
```

The static tail (`COMMON_TERMS` in the file) is intentionally tight (~17 entries) to leave Whisper's 224-token budget for the per-product vocabulary. Grow as new niche vocabulary becomes recurrent across uploads.

### /products admin page

- **`app/products/page.tsx`** (server, `force-dynamic`): loads brands + products + per-product video counts; renders grouped by brand with a `ProductRow` per product.
- **`app/products/product-row.tsx`**: collapsed by default with `"N main · M INCI · K videos"` chip; expanded form has separate textareas for `main_ingredients`, `ingredients`, `product_category`, `brand_claims`, plus `source_url` + `notes`. Comma- or newline-separated input; server normalizes via `lib/normalize-tokens.ts`.
- **`app/products/new-product-form.tsx`**: collapsed → "+ New product" button; expanded form has a brand picker with inline "+ New brand" affordance (no workflow break to add brands).
- **`app/api/products/route.ts`** POST: creates a product under an existing brand.
- **`app/api/products/[id]/route.ts`** PATCH: updates the product. When `name` or `brand_id` changes, cascades the new brand_name + product_name into `videos.brand` + `videos.product_name` on related rows (the cache invariant; corpus_chunks.metadata doesn't carry these so no further propagation needed).
- **`app/api/brands/route.ts`** POST: creates a brand (used by the inline affordance).

### Upload form + inline editor pickers

- **`app/(upload)/page.tsx`** (server): loads `products` + brand names, passes to `UploadCard`.
- **`app/(upload)/upload-card.tsx`** (client): brand + product_name text inputs replaced with a single `<select>` grouped by brand via `<optgroup>`. "+ Manage products →" link to `/products` (opens new tab). `POST /api/videos` body now sends `productId` instead of `brand`/`productName`.
- **`app/videos/[id]/editable-metadata.tsx`**: same picker pattern. PATCH body sends `product_id`.
- **`app/api/videos/route.ts`** POST + **`app/api/videos/[id]/route.ts`** PATCH: accept `product_id`, look up the product, set `videos.product_id` + cache `videos.brand` + cache `videos.product_name` from the catalog. Free-text brand/product fields are no longer accepted in the request body — the picker is the only path.
- **`app/layout.tsx`**: nav gains "Products" link.

### Slice 9.5 follow-up (same session)

The 91-INCI Dr. Melaxin Gifted Collagen Boost Set blew past Whisper's 224-token prompt budget. Split `products.ingredients` into:
- `main_ingredients[]` — curated actives (≤15-20 typical), the pipeline biases on this
- `ingredients[]` — full INCI deck (reference + fallback when `main_ingredients` is empty)

Implementation:
- Migration `0013_product_main_ingredients.sql` adds the column.
- `/products` row gets a separate textarea for `main_ingredients` above the full INCI textarea. Header chip reads `"N main · M INCI · K videos"`.
- POST + PATCH `/api/products` accept `main_ingredients`.
- Pipeline STEP 1 prefers `main_ingredients`, falls back to `ingredients`. Same source flows through to STEP 3's `canonical_ingredients` metadata field.

### Commits + deploys

| Commit | Slice | Deploy | Notes |
|---|---|---|---|
| `bff8dd4` | Slice 9 main | `dpl_HB6ZSv1VQjixAHfkCdmonVh6x5uz` READY | Products catalog + Whisper biasing + UI rewire |
| `f5026e0` | Slice 9.5 | `dpl_A7eNeAuVNtu25WpJrQ6ETXocVeTN` READY | main_ingredients split |

### Curation pass observations (worth knowing for next session)

When Cameron curated the first 3 products on `/products`, the full INCI (`ingredients[]`) ended up empty on those rows — looks like the curation pattern was to move content from the INCI textarea up into the `main_ingredients` textarea, then save. Cameron confirmed this is **intentional**: "don't care about full INCI." The retrieval path doesn't depend on `ingredients[]` anyway when `main_ingredients` is populated, so no fix needed. Future curation work should not assume both fields will be populated.

### What landed after Slice 9 (now complete)

The 4-step sequence resolved on 2026-05-29 — see "Slice 9 backfill + canary re-run complete" section below.

## Slice 9 backfill + canary re-run complete (2026-05-29)

The corpus-quality close-out of Slice 9. Cameron curated the remaining 3 products (+ 6 net-new products in the same pass), uploaded 4 canary videos to verify biasing, and then the agent executed the 9-video backfill + canary re-run.

### Pre-conditions Cameron resolved

- **Products catalog 12/12 curated** (was 3/6). 6 new products added in the same session (no videos yet on most), including a new brand (Dr. Dent) and the first non-skincare Medicube product (Deodorant). Curation 12/12 + biasing prompt now covers the full active corpus.
- **Per-product canonical-name additions:** `cemenrete` added to `Dr. Melaxin · Calcium Dark Spot Eye Cream` and `Dr. Melaxin · Calcium Multi Balm` after canary transcripts showed Whisper rendering "Samerante" / "Semerante" — Cameron flagged the canonical brand-line spelling.

### Canary upload pass (4 videos, pre-backfill)

Cameron uploaded 4 new videos against existing catalog products (1× Medicube PDRN Multi Balm, 1× Dr. Melaxin Peel Shot Keratin Care, 2× Dr. Melaxin Calcium Dark Spot Eye Cream). All landed at `status='embedded'` cleanly. Quantitative checks vs. pre-fix corpus:
- `Volufiline`: rendered correctly all 6 instances on `6150d45c` (was systematically `Valofulin` on pre-fix material — confirmed against the `5d44a1de` pre-fix transcript pre-backfill)
- `Dr. Melaxin`: rendered correctly in 3 of 4 mentions across canaries; 1 persistent `Mellaxin` slip on `f5d9a290`
- `PDRN`, `kojic acid`, `turmeric`: all clean
- **Found mid-canary:** `f5d9a290` opened with "Cranes call this literally cement for your face" — should be "Koreans". The static `COMMON_TERMS` tail in `lib/pipeline/whisper-vocab.ts` had `K-beauty` but not `Korean`. Fixed by 1-line addition: `"K-beauty",` → `"K-beauty", "Korean",`.

### Backfill execution (9 videos)

- **Insurance dump:** `db/backfill/0012_pre_rerun.json` captures pre-backfill `product_category`, `active_ingredients`, `function_claims`, `ai_tags` for forensic comparison.
- **Delete scope:** 85 `corpus_chunks` + 9 `breakdowns` + 29 `transcript_chunks` + 9 `transcripts`. 170 `key_frames` preserved (STEP 2 gate stays satisfied).
- **Reset:** all 9 to `status='frames_extracted'` with AI-derivable fields cleared.
- **Re-run:** `npm run process-video <id>` serial loop. Wall time: 52s + (62.4s, 61.8s, 63.2s, 55.2s, 58.5s, 67s, 58.4s, 70.3s) ≈ **9 min total** for 9 videos.
- **Verification:** all 9 land at `status='embedded'` with all 7-8 Slice 8 chunk_kinds present (`tonality`, `authenticity_signals` everywhere). Zero error_messages.

### Active-ingredients cleanup delivered (Slice 9 STEP 3 wording held)

The clearest signal that the STEP 3 spelling-correction-only wording works as designed — per-video `active_ingredients` are now what the creator actually says, not the canonical product list:

| Video | Pre-backfill | Post-backfill |
|---|---|---|
| `ac8a89b6` Gifted Boost Set | **91 INCI rows** (full dump) | **7 ingredients** (creator-named subset) |
| `5d44a1de` BP Spicule | 6 ingredients | 1 (`spicule`) |
| `d21d7f8b` Zero Pore | 6 ingredients | 3 (`aha`, `bha`, `pha` only) |
| `e2afe5c7` Laka Lip Plumper | 22 INCI rows | 0 (creator names no actives) |

### Canary re-run (4 videos, post-backfill)

After the 9-video backfill, the 4 canaries were also re-run against the post-`Korean`-static-tail code + the `cemenrete` per-product addition. **Key validation of Cameron's principle: "don't force the words in if it can't find them."** `cemenrete` was added to both eye-cream products' `main_ingredients`, but **zero** instances of `cemenrete` appear in either canary transcript after re-run. Whisper kept `Samerante` (2× on `f5d9a290`) / `Semerante` (1× on `049d4efd`) because that's what the audio clearly says. Biasing nudged but did not coerce.

`Korean` static-tail addition impact:
- `Cranes` → eliminated across all 4 canaries
- `Korean*` renders correctly on 3 of 4 (2× on `049d4efd`, 3× on `6150d45c`, others)
- `f5d9a290` opening still drifts (`Cranes` → `Kareem's`); acoustic ambiguity Whisper won't bridge from prompt context alone. Acceptable per Cameron's principle.

### Manual stamps restored

`d5240f30.product_category` now reads `["under-eye-treatment", "balm", "skin-care", "concealer-replacement", "moisturizers-and-mists"]` — Claude's 4 derived categories + Cameron's TikTok-shop manual stamp (`moisturizers-and-mists`) re-appended via `array_append`. Pattern: don't replace, append.

### Code change (commit pending)

```diff
   "spicule",
   "Volufiline",
   "K-beauty",
+  "Korean",
   "PDRN",
   "collagen",
```

That's it — one line addition to `lib/pipeline/whisper-vocab.ts`. The `cemenrete` additions are data (in `products.main_ingredients`), not code.

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
