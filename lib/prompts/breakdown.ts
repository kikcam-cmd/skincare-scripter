import Anthropic from "@anthropic-ai/sdk";
import type { BreakdownPayload } from "@/lib/types";

export const BREAKDOWN_MODEL = "claude-sonnet-4-6";

export const SYSTEM_PROMPT = `You are an expert short-form video analyst specializing in TikTok for the
skincare niche. You break down viral videos into their persuasive structure
for a creator who is studying what makes them work. The creator studying
this analysis may be male or female — write the breakdown gender-neutrally
by default.

Only when a beat materially depends on the creator's gender to land (e.g. a
hook that leans on female-coded vulnerability framing, or a demo that reads
differently when performed by a different-gender creator), fill the
\`gender_specific_notes\` field with a concise note naming the dependency
and how a creator of the opposite gender would need to adapt it. When the
video is gender-neutral, leave \`gender_specific_notes\` null — do not pad it.

Structured product retrieval keys — fill these carefully. They are first-class
filters used to match new script requests against past viral material across
brands. Same-ingredient or same-category videos should land together even when
brands differ.

- \`product_category\`: array of 1–4 lowercase-hyphen category descriptors.
  Capture multiple facets:
  (a) the canonical functional category — what the product IS
      (e.g. "lip-plumper", "mud-mask", "under-eye-treatment", "serum",
      "sunscreen", "cleansing-balm", "exfoliant", "essence", "toner",
      "spot-treatment", "moisturizer");
  (b) the TikTok shop classification when the video alludes to it OR
      when the official shop category differs meaningfully from the
      functional one (e.g. a lip plumper TikTok files under
      "lipstick-and-lip-gloss"; a balm filed under "skin-care");
  (c) alternative use-case categories the creator promotes — same
      product framed as a "concealer-replacement" or "filler-dupe" etc.
  Order doesn't matter; preserve the distinctions instead of collapsing
  to one. If only the functional category is clear from the video,
  emit a single-element array — don't invent the others.

- \`active_ingredients\`: array of chemical / INCI ingredient names, lowercase
  hyphen-separated. ONLY include ingredients explicitly named in the video
  (transcript or on-screen text), not ingredients you assume the product
  contains. Examples: "hypochlorous-acid", "niacinamide", "retinol",
  "salicylic-acid", "vitamin-c", "hyaluronic-acid", "peptides", "ceramides",
  "azelaic-acid", "tretinoin", "spicule" (when named that way),
  "aha", "bha", "pha", "bentonite", "kaolin". Leave empty if no
  ingredient is named.

- \`function_claims\`: array of what the creator says the product DOES,
  FIXES, IMPROVES, or PROMISES in the video — captured in the creator's
  framing, NOT restricted to brand-compliant language. Creators are
  liberal with claims; brands are not. If the creator promises filler-
  level results, anti-aging effects, or visible plumping, those are
  claims, regardless of what the brand legally markets. Examples:
  outcomes ("plumping", "brightening", "anti-aging", "pore-minimizing",
  "acne-clearing", "hydrating", "barrier-repair"), problems addressed
  ("dark-circles", "wrinkles", "sagging", "redness", "blackheads",
  "fine-lines"), aspirational positioning ("filler-dupe",
  "concealer-replacement", "instant-results"). 3–8 typical; lowercase
  hyphen-separated.

When unsure whether a term is an ingredient or a claim, prefer
\`function_claims\` and leave \`active_ingredients\` empty. "Hydrating" is a
claim; "hyaluronic acid" is an ingredient. "Anti-aging" is a claim;
"retinol" is an ingredient.

Also emit 5–10 \`ai_tags\` for the dimensions NOT covered by the structured
fields above: audience signal, content format, hook tactic, use case
(examples: "gen-z-female-audience", "before-after-demo", "stitch-reaction",
"car-confessional-format", "objection-bait-hook", "ugc-style",
"comment-reply-format"). Do NOT duplicate product_category, ingredients, or
claims into ai_tags — those have dedicated fields now. Tags lowercase,
hyphen-separated, no leading punctuation.

You will receive:
- The full transcript as timestamped lines: [t_start-t_end] text
- A sequence of key frames in chronological order, each preceded by a marker
  of the form [FRAME @ t=X.Xs] so you can align what is SAID with what is SHOWN
- Optional video metadata (creator handle, view count, niche tag, duration)

If the transcript is empty (B-roll-only video, music-only, no speech), derive
the breakdown entirely from the frames + metadata. Still fill every required
span (hook, problem, twist, solution, cta) by inferring intent from the visual
storytelling — TikToks routinely deliver complete persuasive arcs with zero
spoken words. Use bracket-prefixed visual descriptions in the \`text\` fields,
e.g. "[VISUAL: hand pumping cleanser onto the back of the other hand, slow
zoom on the texture]". Set timestamps to the frame range that backs each beat.

Always cross-reference transcript timestamps with the nearest frame timestamps.
Every span you cite (hook, problem, twist, solution, cta) must include
\`t_start\` and \`t_end\` that fall within the transcript's actual range (or the
video's duration when the transcript is empty).

Be specific. Avoid generic phrases like "engaging hook" — name the tactic
("pattern interrupt with a contrarian claim", "false-authority gambit",
"objection bait", "shame-into-curiosity flip"). When you cite a buyer-
psychology lever, name the canonical pattern (loss aversion, social proof,
authority, scarcity, identity signaling, etc.).

Call the submit_breakdown tool exactly once with the structured analysis.`;

export const submitBreakdownTool = {
  name: "submit_breakdown",
  description: "Submit the structured breakdown of the video.",
  input_schema: {
    type: "object",
    required: [
      "hook", "problem", "twist", "solution", "cta",
      "tonality", "authenticity_signals", "pacing_notes",
      "buyer_psychology_levers", "visual_style_notes",
      "gender_specific_notes", "ai_tags",
      "product_category", "active_ingredients", "function_claims",
    ],
    properties: {
      hook: {
        type: "object",
        required: ["text", "t_start", "t_end", "type", "why_it_works"],
        properties: {
          text: { type: "string" },
          t_start: { type: "number" },
          t_end: { type: "number" },
          type: { type: "string" },
          why_it_works: { type: "string" },
        },
      },
      problem: {
        type: "object",
        required: ["text", "t_start", "t_end", "framing"],
        properties: {
          text: { type: "string" },
          t_start: { type: "number" },
          t_end: { type: "number" },
          framing: { type: "string" },
        },
      },
      twist: {
        type: "object",
        required: ["text", "t_start", "t_end", "tactic"],
        properties: {
          text: { type: "string" },
          t_start: { type: "number" },
          t_end: { type: "number" },
          tactic: { type: "string" },
        },
      },
      solution: {
        type: "object",
        required: ["text", "t_start", "t_end"],
        properties: {
          text: { type: "string" },
          t_start: { type: "number" },
          t_end: { type: "number" },
        },
      },
      cta: {
        type: "object",
        required: ["text", "t_start", "t_end", "style"],
        properties: {
          text: { type: "string" },
          t_start: { type: "number" },
          t_end: { type: "number" },
          style: { type: "string" },
        },
      },
      tonality: { type: "string" },
      authenticity_signals: { type: "array", items: { type: "string" } },
      pacing_notes: { type: "string" },
      buyer_psychology_levers: { type: "array", items: { type: "string" } },
      visual_style_notes: { type: "string" },
      gender_specific_notes: { type: ["string", "null"] },
      ai_tags: { type: "array", items: { type: "string" } },
      product_category: { type: "array", items: { type: "string" } },
      active_ingredients: { type: "array", items: { type: "string" } },
      function_claims: { type: "array", items: { type: "string" } },
    },
  },
} as const satisfies Anthropic.Tool;

type CallArgs = {
  metadata: {
    creator_handle: string | null;
    view_count: number | bigint | null;
    niche_tag: string | null;
    duration_seconds: number;
    creator_gender: "male" | "female" | "unknown";
    brand: string | null;
    product_name: string | null;
    user_notes: string | null;
  };
  transcriptLines: { t_start: number; t_end: number; text: string }[];
  frames: { t_seconds: number; base64: string }[];
};

export async function callClaudeBreakdown(
  anthropic: Anthropic,
  args: CallArgs,
): Promise<{ parsed: BreakdownPayload; raw: Anthropic.Message }> {
  const { metadata: m, transcriptLines, frames } = args;
  const transcriptText = transcriptLines.length
    ? transcriptLines
        .map((c) => `[${c.t_start.toFixed(2)}-${c.t_end.toFixed(2)}] ${c.text}`)
        .join("\n")
    : "(empty — derive entirely from frames)";

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text:
        `Video metadata:\n` +
        `- Creator: @${m.creator_handle ?? "unknown"}\n` +
        `- Creator gender: ${m.creator_gender}\n` +
        `- Brand: ${m.brand ?? "unknown"}\n` +
        `- Product: ${m.product_name ?? "unknown"}\n` +
        `- Views: ${m.view_count ?? "unknown"}\n` +
        `- Niche tag: ${m.niche_tag ?? "unknown"}\n` +
        `- Duration: ${m.duration_seconds}s\n` +
        (m.user_notes ? `- User notes: ${m.user_notes}\n` : "") +
        `\nTranscript:\n${transcriptText}\n\n` +
        `Key frames (in order):`,
    },
    ...frames.flatMap(
      (f) =>
        [
          { type: "text", text: `[FRAME @ t=${f.t_seconds.toFixed(1)}s]` },
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: f.base64 },
          },
        ] as Anthropic.ContentBlockParam[],
    ),
    { type: "text", text: "Now call submit_breakdown with your analysis." },
  ];

  const raw = await anthropic.messages.create({
    model: BREAKDOWN_MODEL,
    // Real breakdowns run ~2.5-3k output tokens because the tactic-naming +
    // authenticity signals fields are intentionally rich. 4000 leaves headroom
    // for ai_tags + gender_specific_notes without truncation.
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
    tools: [submitBreakdownTool],
    tool_choice: { type: "tool", name: "submit_breakdown" },
  });
  if (raw.stop_reason === "max_tokens") {
    console.warn(
      `Claude hit max_tokens for video breakdown — output may be truncated. ` +
        `Consider raising max_tokens above 4000.`,
    );
  }

  const toolUse = raw.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Claude did not return a tool_use block");
  }
  const parsed = toolUse.input as BreakdownPayload;
  validateAndClamp(parsed, m.duration_seconds);
  return { parsed, raw };
}

function validateAndClamp(p: BreakdownPayload, duration: number) {
  for (const span of [p.hook, p.problem, p.twist, p.solution, p.cta] as {
    t_start: number;
    t_end: number;
  }[]) {
    span.t_start = Math.max(0, Math.min(duration, span.t_start));
    span.t_end = Math.max(span.t_start, Math.min(duration, span.t_end));
  }
}
