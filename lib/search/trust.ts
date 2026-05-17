// Per source_label trust weights for the knowledge half of the corpus.
// Editable as a constant in v0; promote to a DB table in Phase 2 (PLAN §8).
//
// Range is loose: 0.5 (low-trust scraped notes) to ~1.5 (authoritative books).
// Default for unknown labels is 1.0 so adding a new source doesn't penalize
// it before Cameron weighs in.

const TRUST_BY_LABEL: Record<string, number> = {
  "Hormozi - $100M Offers": 1.2,
  "personal notes": 0.7,
};

const DEFAULT_TRUST = 1.0;

export function trustForLabel(label: string | null | undefined): number {
  if (!label) return DEFAULT_TRUST;
  return TRUST_BY_LABEL[label] ?? DEFAULT_TRUST;
}
