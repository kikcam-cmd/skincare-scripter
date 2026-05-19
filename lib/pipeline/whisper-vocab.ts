// Builds the Whisper transcription prompt — biases the decoder toward
// expected vocabulary so proper nouns and ingredient names land correctly
// (e.g. "Volufiline" instead of "Valofulin", "Dr. Melaxin" instead of
// "dr millexon"). Whisper's `prompt` field is ~224 tokens and conditions
// the first 30-second chunk; for TikTok-length material (≤60s typical)
// this is enough.
//
// Natural-language phrasing biases better than a bare comma list. Per-
// product ingredients come from products.ingredients[] (loaded via
// videos.product_id); a small static tail of common skincare actives
// catches anything not in the product catalog.

export type WhisperPromptInput = {
  brand: string | null;
  productName: string | null;
  productIngredients: string[];
  userNotes: string | null;
};

// Hyphen → space for natural-language phrasing in the prompt. The Whisper
// decoder reads the prompt as if it were a previous transcript snippet,
// so "hyaluronic acid" biases better than "hyaluronic-acid".
function naturalize(token: string): string {
  return token.replace(/-/g, " ");
}

// Common skincare terms not always covered by a single product's ingredient
// list. Kept tight (≤20 entries) to leave Whisper's prompt budget for the
// per-product vocabulary.
const COMMON_TERMS = [
  "niacinamide",
  "retinol",
  "hyaluronic acid",
  "salicylic acid",
  "glycolic acid",
  "azelaic acid",
  "vitamin C",
  "ceramides",
  "peptides",
  "centella asiatica",
  "panthenol",
  "allantoin",
  "spicule",
  "Volufiline",
  "K-beauty",
  "PDRN",
  "collagen",
];

export function buildWhisperPrompt({
  brand,
  productName,
  productIngredients,
  userNotes,
}: WhisperPromptInput): string {
  const parts: string[] = ["This is a skincare product review for TikTok."];

  if (brand && productName) {
    parts.push(`The product is ${brand}'s ${productName}.`);
  } else if (brand) {
    parts.push(`The brand is ${brand}.`);
  } else if (productName) {
    parts.push(`The product is ${productName}.`);
  }

  // Cap at 30 ingredients to stay under Whisper's prompt budget. For
  // products with full INCI decks (e.g. the 91-ingredient Boost Set) the
  // first ~30 are usually the actives + meaningful preservatives.
  if (productIngredients.length > 0) {
    const list = productIngredients.slice(0, 30).map(naturalize).join(", ");
    parts.push(`The product contains: ${list}.`);
  }

  if (userNotes) {
    parts.push(`Context: ${userNotes}.`);
  }

  parts.push(`Common terms in this niche: ${COMMON_TERMS.join(", ")}.`);

  return parts.join(" ");
}
