# skincare-scripter

TikTok scripting copilot for the skincare niche — a self-curated corpus of
viral video breakdowns + framework knowledge, feeding a RAG-driven script
generator. Single-creator ingestion (Cameron); script generation opens to
invited affiliate creators in Phase 2.

Personal project, not for redistribution.

## Where to start reading

Order matters — these are the source-of-truth docs:

1. [`STATUS.md`](./STATUS.md) — rolling session-handoff. Current state,
   next concrete action, known issues. **Read first when picking up.**
2. [`SPEC.md`](./SPEC.md) — the brief. Positioning, scope, locked decisions.
3. [`PLAN.md`](./PLAN.md) — v0 implementation plan (historical reference;
   v0 shipped).
4. [`PLAN_PHASE2.md`](./PLAN_PHASE2.md) — Phase 2 (script generator)
   planning doc. Three open questions in §2 gate the slice plan.
5. [`AGENTS.md`](./AGENTS.md) — agent-targeted notes (Next.js 16 conventions,
   etc.).

## Local dev

```bash
npm install
npm run dev                              # next dev (port 3001 if 3000 busy)
npm run process-video <video-uuid>       # run pipeline standalone without HTTP
npm run process-knowledge <id>           # same for knowledge ingestion
npx tsc --noEmit                         # type check
```

Required env vars are documented in `STATUS.md` § "Required env vars".

## Deploy

Auto-deployed to `skincare-scripter.vercel.app` on push to `main`, gated by
Basic Auth (`APP_PASSWORD` env var, enforced in `proxy.ts`). See `STATUS.md`
§ "Vercel Standard Protection alias gap" for why proxy-level auth is the
real gate.
