# Status

Rolling session-handoff doc. Read this first when picking up the project — it points at the source-of-truth files and tells you exactly what to do next. Update it at the end of every working session.

---

## Where we are right now

**Phase:** **Slice 2 shipped.** Pipeline now persists everything it
produces: `transcripts` + `transcript_chunks` rows from Groq, frame JPGs
in `videos/frames/{id}/` storage + `key_frames` rows. Video detail page
is a real study tool — HTML5 player, frame strip thumbnails, transcript
chunks with clickable timestamps that seek the video. Scene-detect frame
extraction (PLAN §4) deferred — current evenly-spaced is fine. Step
gating + idempotent retries are Slice 3 (next).

**Last updated:** 2026-05-16

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
| 3 | Idempotent pipeline + status tracking + retry button | partial (retry button + status enum shipped, no step gating) |
| 4 | Embeddings + similar-videos panel | not started |
| 5 | Knowledge ingestion (PDF/MD/TXT/pasted) | not started |
| 6 | Unified search across both corpora | not started |
| 7 | Polish (editable metadata, niche tags, clickable timestamps) | not started |

## Next concrete action

**Slice 2 smoke test on Vercel** — open the prod URL, upload one fresh MP4, confirm:
1. Video player loads (signed URL works for the MP4 in private bucket)
2. Frame strip renders with thumbnails after frames extract
3. Transcript chunks list renders and clicking a timestamp seeks the video
4. Currently-playing chunk + frame are highlighted as the video plays

Then **start Slice 3** — idempotent pipeline + step gating + checkpointing. The retry button currently re-bills Groq + Claude on every click; Slice 3 makes the pipeline DB-existence-gated so a re-run resumes from where it failed. PLAN §3 "Retry / idempotency" has the full spec.

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

- **Pipeline is single-shot, not idempotent.** `Re-run pipeline` deletes every child row (breakdowns + transcripts + transcript_chunks + key_frames) and the JPGs in `frames/{id}/` storage, then re-runs the full pipeline, re-billing Groq + Claude. Step gating + checkpointing is **Slice 3**.
- ~~**No transcripts/frames persistence.**~~ **Slice 2 ✓** — both persisted, retry cleans them up.
- **No dedup.** `content_hash` column exists but the pipeline doesn't compute or check it. Re-uploading the same MP4 creates duplicate work. Slice 3 adds the sha256 STEP 0.
- **`max_tokens=4000`** for Claude breakdown (bumped from 2000 after first run truncated `male_creator_relevance`). If future runs still truncate, raise further.
- **Frame extraction is still evenly-spaced** via per-frame `-ss` seek, not the hybrid scene-detect from PLAN §4. Deferred from Slice 2 — promote if breakdown quality suffers on longer/montage-heavy videos.

## Required env vars

```
NEXT_PUBLIC_SUPABASE_URL=          # set in .env.local
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # set
SUPABASE_SERVICE_ROLE_KEY=         # set
ANTHROPIC_API_KEY=                 # set
GROQ_API_KEY=                      # set
APP_PASSWORD=                      # Basic Auth gate (proxy.ts). Required — app returns 503 if missing.
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
<new>   Ship Slice 2: transcripts/frames persistence + study-tool UI
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
