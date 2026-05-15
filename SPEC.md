# skincare-scripter

A personal TikTok scripting copilot for breaking into the male-skincare niche. Self-use only for v0 — no auth, no multi-tenant, no billing.

## Positioning

Cameron is a male creator entering a female-dominant niche. The tool itself must learn this positioning — outputs should respect that frame, not produce generic skincare-creator content. The angle (male-in-female-niche) is part of the product.

## Two ingestion paths, one corpus

1. **Video uploads (manual)** — Cameron records/saves viral TikToks to camera roll, drags MP4 into the app with optional metadata (creator handle, view count, post date, niche tag).
2. **Knowledge uploads** — PDFs / Markdown / TXT / pasted transcripts of books, course notes, swipe files, frameworks. Optional source label.

Both flow into the same searchable corpus (pgvector), with separate detail views.

## v0 scope (this project)

**Phase 1 (v0): Video analysis + KB ingestion only.** No script generator yet — that's Phase 2. Rationale: build the corpus first so script generation later is grounded in real analyzed data, not assumed frameworks.

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
  "male_creator_relevance": "string"
}
```

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
| Embeddings | TBD — likely OpenAI `text-embedding-3-small` or Voyage AI |
| Video tooling | `ffmpeg-static` inside the Vercel function |

Auth: none for v0 (single-user, possibly behind Vercel deployment protection).

## Out of scope for v0 (future phases)

- Phase 2: Script generator (RAG over corpus + frameworks → drafts)
- Phase 3: Performance feedback loop (post → log views/engagement → reweight retrieval)
- Phase 4: Multi-user / auth / billing if Cameron decides to productize

## Open questions for the planner

1. **Embeddings provider** — OpenAI `text-embedding-3-small` is cheapest/fastest but introduces another vendor. Voyage AI Claude-aligned alternative? Local with Transformers.js? Recommend.
2. **Frame extraction count vs cost** — Claude vision charges per image. Is 15 frames per ~30s video the right ceiling, or should we be smarter (scene-change detection)?
3. **Vercel Fluid duration** — confirm a 30-60s TikTok pipeline (download from storage → ffmpeg → Groq → Claude vision call with 15 frames → write back) fits comfortably under the function timeout.
4. **Idempotency / retries** — pipeline is multi-step; if Claude call fails after Groq succeeds, how do we resume without re-billing transcription?
5. **Schema design** — should `videos`, `knowledge_items`, and a unified `corpus_chunks` table for embeddings be the right shape? Or per-type embedding tables?
6. **Local dev parity** — is there a sane way to run the ffmpeg + Groq pipeline locally without spinning up Vercel emulators every time?

## Decisions already locked

- Workspace path: `~/Projects/TikTok/skincare-scripter`
- Manual video upload (no `yt-dlp`, no TikTok API)
- Video analysis built before script generator
- Groq Whisper for transcription (Claude does not accept native audio)
- Self-only MVP — no auth/multi-tenant work
