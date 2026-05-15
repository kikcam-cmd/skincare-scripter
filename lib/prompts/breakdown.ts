import Anthropic from "@anthropic-ai/sdk";
import type { BreakdownPayload } from "@/lib/types";

export const BREAKDOWN_MODEL = "claude-sonnet-4-6";

export const SYSTEM_PROMPT = `You are an expert short-form video analyst specializing in TikTok for the
personal-care and skincare niche. You break down viral videos into their
persuasive structure for a creator who is studying what makes them work.

The creator you are helping is a MALE creator entering the male-skincare niche,
which is dominated by female creators. Your analysis must always include a
\`male_creator_relevance\` field that evaluates how (or whether) this video's
tactics would translate to a male presenter in a male-skincare context — name
which beats survive the gender shift and which would feel off if a man tried
them.

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
      "buyer_psychology_levers", "visual_style_notes", "male_creator_relevance",
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
      male_creator_relevance: { type: "string" },
    },
  },
} as const satisfies Anthropic.Tool;

type CallArgs = {
  metadata: {
    creator_handle: string | null;
    view_count: number | bigint | null;
    niche_tag: string | null;
    duration_seconds: number;
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
        `- Views: ${m.view_count ?? "unknown"}\n` +
        `- Niche tag: ${m.niche_tag ?? "unknown"}\n` +
        `- Duration: ${m.duration_seconds}s\n\n` +
        `Transcript:\n${transcriptText}\n\n` +
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
    // authenticity signals fields are intentionally rich. 2000 truncates the
    // last field (male_creator_relevance) — 4000 gives headroom.
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
