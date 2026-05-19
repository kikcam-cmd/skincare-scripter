// Normalize comma- or newline-separated input (or an array) to deduped
// lowercase-hyphen tokens. Matches the format Claude emits for ai_tags /
// active_ingredients / function_claims and the existing PATCH /api/videos
// normalizer. `&` → " and " before whitespace collapse so UI-typed
// "Moisturizers & Mists" lands as `moisturizers-and-mists`, matching the
// TikTok shop convention seen in `lipstick-and-lip-gloss`.
export function normalizeTokens(input: unknown): string[] {
  if (input === null || input === undefined) return [];
  const raw = Array.isArray(input) ? input : String(input).split(/[,\n]/);
  const out = new Set<string>();
  for (const item of raw) {
    const t = String(item)
      .trim()
      .toLowerCase()
      .replace(/\s*&\s*/g, " and ")
      .replace(/\s+/g, "-");
    if (t) out.add(t);
  }
  return [...out];
}
