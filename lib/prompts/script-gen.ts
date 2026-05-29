import Anthropic from "@anthropic-ai/sdk";
import type { RankedResult } from "@/lib/search/query";

export const SCRIPT_GEN_MODEL = "claude-sonnet-4-6";

export const SYSTEM_PROMPT = `You are an expert short-form video scriptwriter for the personal-care and
skincare niche. You write NEW scripts that apply the persuasive patterns
demonstrated in a curated corpus of viral TikToks. The corpus chunks you
receive are TRAINING MATERIAL — what works in this space — NOT template
content to reproduce.

A skilled scriptwriter approaches research like this: read the corpus,
extract the patterns (hook tactics, tonality, authenticity signals, buyer
psychology levers, visual moves), then synthesize a fresh script that
applies those patterns to the affiliate's specific product and intent. You
operate the same way.

HARD CONSTRAINTS

- Do NOT reproduce any phrase of 5+ consecutive words verbatim from the
  grounding chunks.
- Do NOT use a grounding chunk's literal hook as your hook. Identify the
  TACTIC behind it (e.g. "filler-dupe positioning", "viral-label hijack",
  "manufactured-complaint hook") and apply that tactic to the affiliate's
  product in fresh language.
- Cite the grounding chunks that taught you each element. Every output
  element carries \`cited_chunk_ids: string[]\` — at least one chunk_id when
  the element is grounded in the corpus, empty array when the element is
  filling a gap the corpus did not cover. When filling a gap, use the
  marker \`[NEEDS CREATOR INPUT]\` somewhere in the element's text so the
  affiliate sees what wasn't grounded.
- If the affiliate's product has low chunk density in the grounding, prefer
  fewer, more grounded outputs over confidently inventing material. Three
  strong, cited hooks beat five weak, ungrounded ones.
- DIVERSIFY VIA KNOWLEDGE FRAMEWORKS: when the grounding includes any
  knowledge chunks (any chunk whose source line begins with \`knowledge ·\`
  — these are framework principles like Cialdini's reciprocity /
  social-proof / authority / scarcity / unity), include at least one
  output element whose primary tactic comes from a knowledge framework
  principle, not from a per-video corpus chunk. Cite the framework chunk
  explicitly in that element's \`cited_chunk_ids\`. The goal is to bring
  at least one angle the affiliate's existing videos have NOT already
  tried, using cross-product persuasion principles as the source. This
  requirement is waived only when zero knowledge chunks are in the
  grounding.

INPUT YOU RECEIVE

- PRODUCT — brand, product name, canonical main_ingredients (the curated
  active-ingredient list from the catalog). Treat main_ingredients as the
  truth source for what the product contains; do not invent additional
  ingredients or claim ingredients the catalog doesn't list.
- INTENT — the affiliate's natural-language description of what they want
  (e.g. "viral hook ideas", "full script", "before-after demo angle",
  "comment-reply CTA").
- CREATOR GENDER — male / female / unknown. The script must feel natural
  for this presenter. For "unknown", default to gender-neutral framing.
- GROUNDING CHUNKS — retrieved corpus chunks, each tagged with chunk_id,
  source (video or knowledge item), and chunk_kind. The chunk_kinds you
  will see and how to use each:
  * \`breakdown_summary\` — the original video's hook/problem/twist/solution/
    cta as Claude analyzed it. High copy risk — extract patterns, do not
    paste.
  * \`transcript_chunks\` — raw creator speech. Same — extract pacing and
    tonality, do not paste.
  * \`buyer_psych_levers\` — abstracted persuasion mechanisms (loss
    aversion, RN authority, social proof). Safe to apply directly.
  * \`authenticity_signals\` — what made the video feel unscripted (bare
    skin, finger-pad proof, comment overlay). Safe to suggest directly.
  * \`tonality\` — register description (conspiratorial-girlfriend,
    car-confessional, authoritative-confessional hybrid). Safe to direct
    the new script's voice.
  * \`gender_specific_notes\` — gender-coding observations. Safe to apply
    when creator_gender matches; otherwise adapt cross-gender per the note.
  * \`ai_tags\` — freeform pattern tags. Safe to reuse as taxonomy.
  * Knowledge items (Cialdini, Hormozi, etc.) — cross-product frameworks.
    Safe to apply directly.

TOOL SELECTION

Classify the affiliate's INTENT and call exactly ONE tool:

- \`submit_hook_ideas\` — intent asks for hook variants ("viral hook ideas",
  "5 hooks for X", "hooks targeting Y"). Returns 3-5 distinct hooks.
- \`submit_full_script\` — intent asks for a complete script ("full script",
  "write me a script", "draft a video"). Returns full beats.
- \`submit_demo_angle\` — intent asks for a visual/format angle
  ("before-after demo", "stitch reaction", "split-screen comparison",
  "comment-reply format"). Returns visual treatment plus the beats that
  hang on it.
- \`submit_freeform\` — fallback when the intent does not cleanly map to
  the above. Returns the most useful shape plus a short note explaining
  why you picked this shape.

Call exactly one tool. Cite chunk_ids on every element.`;

// --- Tool schemas. One per output_kind; tool_choice forces "any" so Claude
// must pick one but is free to choose which.

const citedChunkIds = {
  type: "array",
  items: { type: "string" },
  description:
    "chunk_ids (from the GROUNDING CHUNKS provided) this element draws from. " +
    "Empty array if [NEEDS CREATOR INPUT].",
} as const;

export const submitHookIdeasTool = {
  name: "submit_hook_ideas",
  description: "Return 3-5 distinct viral hook ideas for the affiliate.",
  input_schema: {
    type: "object",
    required: ["hooks", "tonality_direction"],
    properties: {
      hooks: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          required: ["text", "tactic", "why_it_works", "cited_chunk_ids"],
          properties: {
            text: { type: "string", description: "The hook copy (3-15 seconds spoken)." },
            tactic: {
              type: "string",
              description:
                "Canonical tactic name (e.g. 'filler-dupe positioning', " +
                "'viral-label hijack', 'manufactured-complaint hook').",
            },
            why_it_works: {
              type: "string",
              description: "One-sentence explanation grounded in the corpus pattern.",
            },
            cited_chunk_ids: citedChunkIds,
          },
        },
      },
      tonality_direction: {
        type: "string",
        description:
          "Suggested voice/register for the whole video, derived from corpus tonality chunks.",
      },
      notes: {
        type: ["string", "null"],
        description: "Optional context for the affiliate (e.g. low-grounding warning).",
      },
    },
  },
} as const satisfies Anthropic.Tool;

export const submitFullScriptTool = {
  name: "submit_full_script",
  description: "Return a complete short-form script with all beats.",
  input_schema: {
    type: "object",
    required: [
      "hook", "problem", "twist", "solution", "cta",
      "tonality", "pacing_notes", "visual_direction",
      "authenticity_signals_to_use",
    ],
    properties: {
      hook: {
        type: "object",
        required: ["text", "tactic", "cited_chunk_ids"],
        properties: {
          text: { type: "string" },
          tactic: { type: "string" },
          cited_chunk_ids: citedChunkIds,
        },
      },
      problem: {
        type: "object",
        required: ["text", "framing", "cited_chunk_ids"],
        properties: {
          text: { type: "string" },
          framing: { type: "string" },
          cited_chunk_ids: citedChunkIds,
        },
      },
      twist: {
        type: "object",
        required: ["text", "tactic", "cited_chunk_ids"],
        properties: {
          text: { type: "string" },
          tactic: { type: "string" },
          cited_chunk_ids: citedChunkIds,
        },
      },
      solution: {
        type: "object",
        required: ["text", "cited_chunk_ids"],
        properties: {
          text: { type: "string" },
          cited_chunk_ids: citedChunkIds,
        },
      },
      cta: {
        type: "object",
        required: ["text", "style", "cited_chunk_ids"],
        properties: {
          text: { type: "string" },
          style: { type: "string" },
          cited_chunk_ids: citedChunkIds,
        },
      },
      tonality: { type: "string" },
      pacing_notes: { type: "string" },
      visual_direction: { type: "string" },
      authenticity_signals_to_use: {
        type: "array",
        items: { type: "string" },
        description: "Specific authenticity tactics from corpus to apply (e.g. 'bare-skin demo', 'finger-pad proof').",
      },
      notes: { type: ["string", "null"] },
    },
  },
} as const satisfies Anthropic.Tool;

export const submitDemoAngleTool = {
  name: "submit_demo_angle",
  description:
    "Return a visual/format treatment (demo angle, before-after structure, " +
    "comment-reply format, stitch-reaction angle).",
  input_schema: {
    type: "object",
    required: [
      "visual_setup", "demo_beats", "voiceover_direction", "cited_chunk_ids",
    ],
    properties: {
      visual_setup: {
        type: "string",
        description: "The shot/setting/framing the creator should use.",
      },
      demo_beats: {
        type: "array",
        items: {
          type: "object",
          required: ["beat", "cited_chunk_ids"],
          properties: {
            beat: { type: "string" },
            t_marker: { type: ["string", "null"], description: "Optional time hint (e.g. '0-3s')." },
            cited_chunk_ids: citedChunkIds,
          },
        },
      },
      proof_moments: {
        type: "array",
        items: { type: "string" },
        description: "Specific proof beats (split-screen, before-after insert, finger-pad demo, etc.).",
      },
      on_screen_text_suggestions: {
        type: "array",
        items: { type: "string" },
      },
      voiceover_direction: { type: "string" },
      cited_chunk_ids: citedChunkIds,
    },
  },
} as const satisfies Anthropic.Tool;

export const submitFreeformTool = {
  name: "submit_freeform",
  description:
    "Fallback when the intent doesn't cleanly map to hook ideas / full script / demo angle.",
  input_schema: {
    type: "object",
    required: ["shape_note", "sections"],
    properties: {
      shape_note: {
        type: "string",
        description: "Brief explanation of why this shape was chosen for the intent.",
      },
      sections: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["body", "cited_chunk_ids"],
          properties: {
            heading: { type: ["string", "null"] },
            body: { type: "string" },
            cited_chunk_ids: citedChunkIds,
          },
        },
      },
    },
  },
} as const satisfies Anthropic.Tool;

export const ALL_SCRIPT_TOOLS = [
  submitHookIdeasTool,
  submitFullScriptTool,
  submitDemoAngleTool,
  submitFreeformTool,
] as const;

export type ScriptOutputKind =
  | "hook_ideas"
  | "full_script"
  | "demo_angle"
  | "freeform";

export const TOOL_NAME_TO_KIND: Record<string, ScriptOutputKind> = {
  submit_hook_ideas: "hook_ideas",
  submit_full_script: "full_script",
  submit_demo_angle: "demo_angle",
  submit_freeform: "freeform",
};

// --- Render the grounding block. Each chunk gets its chunk_id, source, kind,
// and text body. Knowledge items are tagged as such so Claude knows it's a
// framework reference vs a viral-video pattern.

export function formatGroundingChunks(chunks: RankedResult[]): string {
  if (chunks.length === 0) return "(no grounding chunks retrieved)";
  return chunks
    .map((c, i) => {
      const source = c.video_id
        ? `video · ${c.video_brand ?? "?"} · ${c.video_product_name ?? "?"}`
        : `knowledge · ${c.knowledge_title ?? c.knowledge_filename ?? "?"}`;
      return [
        `--- chunk ${i + 1} ---`,
        `chunk_id: ${c.chunk_id}`,
        `source: ${source}`,
        `kind: ${c.chunk_kind}`,
        `text:`,
        c.text.trim(),
      ].join("\n");
    })
    .join("\n\n");
}

export function formatProductContext(product: {
  brand: string | null;
  product_name: string | null;
  main_ingredients: string[];
  product_category: string[];
}): string {
  return [
    `- Brand: ${product.brand ?? "(unspecified)"}`,
    `- Product: ${product.product_name ?? "(unspecified)"}`,
    `- Main ingredients (catalog truth source): ${
      product.main_ingredients.length
        ? product.main_ingredients.join(", ")
        : "(none curated)"
    }`,
    `- Category: ${
      product.product_category.length ? product.product_category.join(", ") : "(uncategorized)"
    }`,
  ].join("\n");
}

export type ScriptGenInput = {
  productContext: string;
  intent: string;
  creatorGender: "male" | "female" | "unknown";
  groundingChunks: RankedResult[];
};

export type ScriptGenResult = {
  outputKind: ScriptOutputKind;
  output: Record<string, unknown>;
  raw: Anthropic.Message;
};

export async function callClaudeScriptGen(
  anthropic: Anthropic,
  input: ScriptGenInput,
): Promise<ScriptGenResult> {
  const groundingText = formatGroundingChunks(input.groundingChunks);
  const userText =
    `PRODUCT:\n${input.productContext}\n\n` +
    `INTENT:\n${input.intent}\n\n` +
    `CREATOR GENDER: ${input.creatorGender}\n\n` +
    `GROUNDING CHUNKS (${input.groundingChunks.length}):\n${groundingText}\n\n` +
    `Classify the intent, call exactly one tool. Cite chunk_ids on every element.`;

  const raw = await anthropic.messages.create({
    model: SCRIPT_GEN_MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userText }],
    tools: [...ALL_SCRIPT_TOOLS],
    tool_choice: { type: "any" },
  });

  if (raw.stop_reason === "max_tokens") {
    console.warn(
      `Claude hit max_tokens for script-gen — output may be truncated. ` +
        `Consider raising max_tokens above 4000.`,
    );
  }

  const toolUse = raw.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Claude did not return a tool_use block");
  }
  const outputKind = TOOL_NAME_TO_KIND[toolUse.name];
  if (!outputKind) {
    throw new Error(`Claude called unknown tool: ${toolUse.name}`);
  }
  return {
    outputKind,
    output: toolUse.input as Record<string, unknown>,
    raw,
  };
}
