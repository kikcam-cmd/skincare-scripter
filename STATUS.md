# Status

Rolling session-handoff doc. Read this first when picking up the project — it points at the source-of-truth files and tells you exactly what to do next. Update it at the end of every working session.

---

## Where we are right now

**Phase:** v0 planning is complete. **No code written yet.** Ready to start Slice 1 (`npx create-next-app@16`).

**Last updated:** 2026-05-14

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
| 1 | Smallest E2E: upload one MP4, see one breakdown. Vercel access protection enabled before first deploy. | not started |
| 2 | Transcripts, frames, auto-trigger from upload | not started |
| 3 | Idempotent pipeline + status tracking + retry button | not started |
| 4 | Embeddings + similar-videos panel | not started |
| 5 | Knowledge ingestion (PDF/MD/TXT/pasted) | not started |
| 6 | Unified search across both corpora | not started |
| 7 | Polish (editable metadata, niche tags, clickable timestamps) | not started |

## Next concrete action

Start Slice 1. The exact opening sequence:

```bash
cd ~/Projects/TikTok/skincare-scripter
npx create-next-app@16 .          # scaffold into existing dir, keep .git
# pick: TypeScript, Tailwind, App Router, no src/, no import alias change
npx shadcn@latest init             # default settings, neutral color
```

Then:
1. Create a new Supabase project via the Supabase MCP (`mcp__claude_ai_Supabase__create_project`). **Do not reuse the DBL project** — that's a hard rule.
2. Apply `db/migrations/0001_init.sql` from `PLAN.md` §2 (write the file from the SQL block in the plan).
3. Set up `lib/supabase/{client,server,admin}.ts`.
4. Build the `app/(upload)/page.tsx` shadcn dropzone + signed-URL flow.
5. Build `app/api/videos/route.ts` with `export const maxDuration = 800` and the `after()`-wrapped pipeline call.
6. Build `lib/pipeline/video.ts` per `PLAN.md` §3 pseudocode.
7. Build `lib/prompts/breakdown.ts` per `PLAN.md` §5.
8. **Enable Vercel Authentication on the project before first deploy** — the URL holds Anthropic + Groq + OpenAI keys.
9. Verify in incognito that the deployed URL is gated.
10. Upload one test MP4 end-to-end. Ship.

## Required env vars (will need them by Slice 1)

```
ANTHROPIC_API_KEY=
GROQ_API_KEY=
OPENAI_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Cameron has Anthropic and Supabase via existing accounts. Groq and OpenAI keys may need to be created — confirm before the first pipeline run, otherwise Slice 1 will fail at the Whisper step.

## Git history

```
1a42593 Patch PLAN.md with five smaller cleanups
9095a38 Patch PLAN.md with four pre-code fixes
0385f65 Add v0 implementation plan from /ultraplan
f89df31 Initial v0 spec for skincare-scripter
```

The two patch commits document specific architectural decisions — read their commit messages if you're wondering why something in `PLAN.md` is shaped a particular way.

## Out of scope for v0 (do not build)

- Script generator (Phase 2)
- Performance feedback loop (Phase 3)
- Auth, multi-tenant, billing (Phase 4 if ever)
- TikTok URL scraping, `yt-dlp`, or TikTok API integration

## Updating this file

End of every working session, update the **Where we are** line, the **slice status table**, and the **Next concrete action** section. Don't let it rot.
