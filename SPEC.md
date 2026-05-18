# skincare-scripter

A TikTok scripting copilot for the skincare niche. Self-curated corpus in v0 — Cameron is the only one feeding videos and knowledge in — opens to affiliate creators (male and female) on the script-generation side in Phase 2. No auth, no billing in v0.

## Positioning

Skincare-focused, multi-creator-gender. Source videos and the eventual script consumers can be male or female; the analysis is gender-neutral by default, and Claude only emits a `gender_specific_notes` field when a beat materially depends on the creator's gender to land. Brand, product, and creator gender are per-video metadata, set on upload. Future beauty expansion is plausible (skincare and beauty share enough vocabulary that a comparison study would tell us whether to merge or keep them separate — that's a Phase 3+ question, not a v0 decision).

## Two ingestion paths, one corpus

1. **Video uploads (manual)** — Cameron records/saves viral TikToks to camera roll, drags MP4 into the app, tags brand, product, creator gender, and optional free-form notes. Claude also extracts 5–10 freeform `ai_tags` per video during analysis (product category, audience signal, content format, use case).
2. **Knowledge uploads** — PDFs / Markdown / TXT / pasted transcripts of books, course notes, swipe files, frameworks. Optional source label.

Both flow into the same searchable corpus (pgvector), with separate detail views.

## v0 scope (this project)

**Phase 1 (v0): Video analysis + KB ingestion only.** No script generator yet — that's Phase 2. Rationale: build the corpus first so script generation later is grounded in real analyzed data, not assumed frameworks. Ingestion is single-user (Cameron). The script generator opens to affiliate creators in Phase 2; at that point `target_creator_gender` becomes a request-time parameter on the script form, and a proper auth/users table lands alongside it.

### Video processing pipeline

1. Receive MP4 upload → store in Supabase Storage with metadata
2. Extract audio with `ffmpeg-static` (Vercel Fluid Function)
3. Transcribe via **Groq Whisper API** with word-level timestamps
4. Sample key frames with ffmpeg: `t=0`, every 2s, `t=end` (cap at ~15 frames for cost)
5. Send frames + transcript to **Claude Sonnet 4.6** (`claude-sonnet-4-6`) → structured breakdown JSON
6. Store breakdown + transcript + frames in Postgres
7. Embed transcript chunks + breakdown summary into pgvector for similarity search

**Breakdown schema (target):**
```json
{
  "hook": { "text", "t_start", "t_end", "type", "why_it_works" },
  "problem": { "text", "t_start", "t_end", "framing" },
  "twist": { "text", "t_start", "t_end", "tactic" },
  "solution": { "text", "t_start", "t_end" },
  "cta": { "text", "t_start", "t_end", "style" },
  "tonality": "string",
  "authenticity_signals": ["string"],
  "pacing_notes": "string",
  "buyer_psychology_levers": ["string"],
  "visual_style_notes": "string",
  "gender_specific_notes": "string | null",
  "ai_tags": ["string"],
  "product_category": ["string"],
  "active_ingredients": ["string"],
  "function_claims": ["string"]
}
```

`gender_specific_notes` is nullable — Claude only fills it when a beat materially depends on the creator's gender to land, and names the adaptation a creator of the opposite gender would need. `ai_tags` are stored on `videos.ai_tags` (filterable metadata), not embedded as a chunk.

The last three fields (`product_category`, `active_ingredients`, `function_claims`) shipped in Slice 8 brain-quality (2026-05-17/18) as structured retrieval keys for cross-brand matching — they answer "what other lip plumpers, niacinamide serums, anti-aging products are in the corpus?" rather than relying on stringy `ai_tags` overlap. All three land on `videos.*` (not `breakdowns.*`) so they're filterable inline-editable metadata. `product_category` carries 1–4 values to preserve both the functional category and the TikTok shop classification. `function_claims` captures *creator-spoken* positioning, not strict brand-compliant language. Slice 8 also adds `videos.gmv_usd` + `videos.items_sold` + `videos.posted_at` (the last already existed) as conversion signals — view count alone over-rewards eyeballs vs. purchases. Ranker formula tuning against these signals is deferred until corpus ≥ ~20 videos with real analytics.

### Knowledge processing pipeline

1. Receive PDF/MD/TXT/pasted text
2. Parse (`pdf-parse` for PDF, native for the rest)
3. Chunk (~500 tokens, semantic boundaries via simple heuristic)
4. Embed → pgvector with source metadata + tags

### UI (read-heavy)

- Library views: videos grid, knowledge list
- Video detail: player, timestamped transcript, breakdown panel, "similar videos" via embeddings
- Knowledge detail: source content + extracted chunks
- Search across both corpora with type/tag filters

## Stack

| Layer | Choice |
|---|---|
| App framework | Next.js 16 (App Router) |
| UI | shadcn/ui + Tailwind |
| Database | Supabase Postgres + pgvector |
| Storage | Supabase Storage |
| Hosting | Vercel (Fluid Compute for the pipeline function) |
| Transcription | Groq Whisper API |
| Vision + analysis | Claude Sonnet 4.6 (`claude-sonnet-4-6`) |
| Embeddings | OpenAI `text-embedding-3-small` (1536d, shipped Slice 4) |
| Video tooling | `ffmpeg-static` inside the Vercel function |

Auth: none for v0 (single-user, possibly behind Vercel deployment protection).

## Out of scope for v0 (future phases)

- Phase 2: Script generator (RAG over corpus + frameworks → drafts)
- Phase 3: Performance feedback loop (post → log views/engagement → reweight retrieval)
- Phase 4: Multi-user / auth / billing if Cameron decides to productize

## Open questions for the planner

*All resolved during v0 build (Slices 1–7, 2026-05-16/17). Kept here as a history pointer; see `STATUS.md` for what shipped.*

1. ~~**Embeddings provider**~~ — OpenAI `text-embedding-3-small` (1536d) shipped. Justified in PLAN §6.
2. ~~**Frame extraction count vs cost**~~ — Settled at 15 frames for ≤60s, 25 absolute max. Hybrid scene-detect deferred (evenly-spaced is adequate so far).
3. ~~**Vercel Fluid duration**~~ — Confirmed on Pro: route-level `maxDuration = 800` accommodates the pipeline comfortably (typical 60s TikTok takes 40–75s end-to-end).
4. ~~**Idempotency / retries**~~ — Slice 3: every step (transcript / frames / breakdown / embed) is gated by a DB existence check; retry resumes without re-billing completed work. STEP 0 sha256 dedup catches re-uploads before any paid API call.
5. ~~**Schema design**~~ — Unified `corpus_chunks` with `source_type` discriminator (video|knowledge) won. Single hnsw plan beats per-type UNION ALL. Slice 5 added `knowledge_item_id` + page/section columns via ALTER.
6. ~~**Local dev parity**~~ — `processVideo()` / `processKnowledge()` are plain async function library exports; `scripts/process-{video,knowledge}.ts` runs them headless via `npm run process-*`. No Vercel emulator needed.

## Decisions already locked

- Workspace path: `~/Projects/TikTok/skincare-scripter`
- Manual video upload (no `yt-dlp`, no TikTok API)
- Video analysis built before script generator
- Groq Whisper for transcription (Claude does not accept native audio)
- Self-only MVP — no auth/multi-tenant work
