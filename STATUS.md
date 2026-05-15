# Status

Rolling session-handoff doc. Read this first when picking up the project — it points at the source-of-truth files and tells you exactly what to do next. Update it at the end of every working session.

---

## Where we are right now

**Phase:** **Slice 1 shipped locally.** First MP4 round-tripped end-to-end:
upload → Groq Whisper → 15 frames via ffmpeg → Claude Sonnet 4.6 breakdown
saved in `breakdowns`, video status=`analyzed`. Breakdown quality is high
(specific tactic names, no generic phrases). Not deployed yet.

**Last updated:** 2026-05-15

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

1. **Vercel plan** — Hobby (300s, free) is sufficient unless Cameron is already on Pro from another project. Pro buys 800s headroom + free Vercel Authentication. **Default: check current plan, lean Hobby unless on Pro for other reasons.**
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
| 1 | Smallest E2E: upload one MP4, see one breakdown. Vercel access protection enabled before first deploy. | **local ✓ — deploy still pending** |
| 2 | Transcripts, frames, auto-trigger from upload | not started |
| 3 | Idempotent pipeline + status tracking + retry button | partial (retry button shipped, no step gating) |
| 4 | Embeddings + similar-videos panel | not started |
| 5 | Knowledge ingestion (PDF/MD/TXT/pasted) | not started |
| 6 | Unified search across both corpora | not started |
| 7 | Polish (editable metadata, niche tags, clickable timestamps) | not started |

## Next concrete action

**Slice 1 is shipped locally.** Two paths from here:

**A. Ship Slice 1 to Vercel** (close the loop on §9 ship criterion: "Vercel access protection enabled before first deploy"):
1. `gh repo create` and push the branch (currently local-only — no remote)
2. `npx vercel link` and import to Vercel project
3. **Enable Vercel Authentication BEFORE first deploy** — URL holds Anthropic + Groq + Supabase service_role keys
4. Push env vars to Vercel: `vercel env add` for all five secrets (Anthropic, Groq, Supabase URL/anon/service_role)
5. Deploy and verify gating in incognito
6. Upload one test MP4 through deployed URL — confirm `outputFileTracingIncludes` for `ffmpeg-static` works (it's the most likely Vercel-only break)

**B. Start Slice 2** (transcripts, frames, auto-trigger) — adds `transcripts`, `transcript_chunks`, `key_frames` tables (migration `0002`) and persists what the Slice 1 pipeline currently throws away after the breakdown lands.

Recommendation: **A first**, so the tool is actually usable from the phone before adding more pipeline complexity.

## Supabase project (this project, NOT DBL)

- ref: `yajpzqbrclsxhljialqs`
- region: us-west-1
- URL: `https://yajpzqbrclsxhljialqs.supabase.co`
- bucket: `videos` (private, 500MB per-object limit). **Project-level upload limit was bumped to 500MB via dashboard** — required for files >50MB (Pro default).

## Known issues / Slice 1 deferrals

- **Pipeline is single-shot, not idempotent.** `Re-run pipeline` deletes the existing breakdown row and re-runs the full pipeline, re-billing Groq + Claude. Step gating + checkpointing is **Slice 3**.
- **No transcripts/frames persistence.** Audio + frames live in `/tmp` for the function lifetime then get cleaned up. `transcripts`, `transcript_chunks`, `key_frames` tables are **Slice 2**.
- **No dedup.** `content_hash` column exists but Slice 1 doesn't compute or check it. Re-uploading the same MP4 creates duplicate work. Slice 3 adds the sha256 STEP 0.
- **`max_tokens=4000`** for Claude breakdown (bumped from 2000 after first run truncated `male_creator_relevance`). If future runs still truncate, raise further.
- **Frame extraction is evenly-spaced via per-frame `-ss` seek**, not the hybrid scene-detect from PLAN §4. Slice 2 promotes to scene-detect when frames start getting persisted.

## Required env vars

```
NEXT_PUBLIC_SUPABASE_URL=          # set in .env.local
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # set
SUPABASE_SERVICE_ROLE_KEY=         # set
ANTHROPIC_API_KEY=                 # set
GROQ_API_KEY=                      # set
# OPENAI_API_KEY=                  # Slice 4 (embeddings)
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
cc02a51 Add STATUS.md as session-handoff doc
1a42593 Patch PLAN.md with five smaller cleanups
9095a38 Patch PLAN.md with four pre-code fixes
0385f65 Add v0 implementation plan from /ultraplan
f89df31 Initial v0 spec for skincare-scripter
```

Slice 1 code is unstaged — commit before deploy.

## Out of scope for v0 (do not build)

- Script generator (Phase 2)
- Performance feedback loop (Phase 3)
- Auth, multi-tenant, billing (Phase 4 if ever)
- TikTok URL scraping, `yt-dlp`, or TikTok API integration

## Updating this file

End of every working session, update the **Where we are** line, the **slice status table**, and the **Next concrete action** section. Don't let it rot.
