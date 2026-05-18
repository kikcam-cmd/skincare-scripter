export type PipelineStatus =
  | "uploaded"
  | "transcribed"
  | "frames_extracted"
  | "analyzed"
  | "embedded"
  | "failed"
  | "duplicate";

export type Span = { text: string; t_start: number; t_end: number };

export type CreatorGender = "male" | "female" | "unknown";

export type BreakdownPayload = {
  hook: Span & { type: string; why_it_works: string };
  problem: Span & { framing: string };
  twist: Span & { tactic: string };
  solution: Span;
  cta: Span & { style: string };
  tonality: string;
  authenticity_signals: string[];
  pacing_notes: string;
  buyer_psychology_levers: string[];
  visual_style_notes: string;
  gender_specific_notes: string | null;
  ai_tags: string[];
  product_category: string[];
  active_ingredients: string[];
  function_claims: string[];
};
