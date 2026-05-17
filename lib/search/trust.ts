// Per source_label trust weights, backed by the source_trust table
// (migration 0009). Promoted from a hardcoded constant per PLAN §8 once
// the /trust admin UI landed in Slice 7 (final round).
//
// Range: 0–2 (CHECK enforced). Default for unknown labels is 1.0 so adding
// a new source doesn't penalize it before Cameron weighs in.

import { createAdminClient } from "@/lib/supabase/admin";

export type TrustMap = Map<string, number>;

const DEFAULT_TRUST = 1.0;

export async function loadTrustMap(): Promise<TrustMap> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("source_trust")
    .select("label, weight");
  if (error) throw new Error(`source_trust read failed: ${error.message}`);
  const map: TrustMap = new Map();
  for (const row of data ?? []) {
    map.set(row.label as string, Number(row.weight));
  }
  return map;
}

export function trustForLabel(
  map: TrustMap,
  label: string | null | undefined,
): number {
  if (!label) return DEFAULT_TRUST;
  return map.get(label) ?? DEFAULT_TRUST;
}
