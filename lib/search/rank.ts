// Weighted ranking applied in-app after the RPC returns the top-k by raw
// cosine distance. See PLAN.md §8 for the formula:
//
//   final = (1 - cosine_distance)         -- primary, 0..1
//         + 0.05 × recency_score          -- exp decay over 90d
//         + 0.08 × virality_score         -- log10(view_count)/7, videos only
//         + 0.05 × source_trust_score     -- per source_label, knowledge only
//
// Recency uses the parent row's date (posted_at → created_at) so re-embedding
// doesn't reset it. virality and source_trust are mutually exclusive by
// source_type and contribute 0 on the wrong side.

import { trustForLabel, type TrustMap } from "./trust";

export type RankInput = {
  similarity: number;
  source_type: "video" | "knowledge";
  // Parent row dates (the chunk's own created_at isn't used — see note above)
  video_posted_at: string | null;
  video_created_at: string | null;
  knowledge_created_at: string | null;
  video_view_count: number | null;
  knowledge_source_label: string | null;
  // Carried for type completeness (RPC projects them, callers can read them
  // from RankedResult). Not currently weighted into finalScore — formula
  // pass deferred until corpus + analytics data exist to tune against.
  video_gmv_usd: number | null;
  video_items_sold: number | null;
};

const RECENCY_HALF_LIFE_DAYS = 90;

export function recencyScore(parentDateISO: string | null): number {
  if (!parentDateISO) return 0;
  const t = new Date(parentDateISO).getTime();
  if (Number.isNaN(t)) return 0;
  const ageDays = (Date.now() - t) / (1000 * 60 * 60 * 24);
  if (ageDays < 0) return 1;
  return Math.exp(-Math.LN2 * (ageDays / RECENCY_HALF_LIFE_DAYS));
}

export function viralityScore(viewCount: number | null): number {
  if (!viewCount || viewCount <= 1) return 0;
  // log10(10M) / 7 ≈ 1. Anything above caps at 1.
  return Math.min(1, Math.log10(viewCount) / 7);
}

export function finalScore(input: RankInput, trustMap: TrustMap): number {
  const parentDate =
    input.source_type === "video"
      ? input.video_posted_at ?? input.video_created_at
      : input.knowledge_created_at;
  const recency = recencyScore(parentDate);
  const virality =
    input.source_type === "video" ? viralityScore(input.video_view_count) : 0;
  const trust =
    input.source_type === "knowledge"
      ? // trust runs ~0–2; normalize to 0..1 around 1.0 baseline
        Math.min(
          1,
          Math.max(
            0,
            (trustForLabel(trustMap, input.knowledge_source_label) - 0.5) / 1.0,
          ),
        )
      : 0;
  return input.similarity + 0.05 * recency + 0.08 * virality + 0.05 * trust;
}

export function rankAndTrim<T extends RankInput>(
  rows: T[],
  trustMap: TrustMap,
  limit = 10,
): (T & { final: number })[] {
  return rows
    .map((r) => ({ ...r, final: finalScore(r, trustMap) }))
    .sort((a, b) => b.final - a.final)
    .slice(0, limit);
}
