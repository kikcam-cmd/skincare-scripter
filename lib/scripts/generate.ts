import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchCorpus, type RankedResult } from "@/lib/search/query";
import {
  callClaudeScriptGen,
  formatProductContext,
  SCRIPT_GEN_MODEL,
} from "@/lib/prompts/script-gen";

// Split 20 chunks: 16 product-anchored video chunks + 4 knowledge framework
// chunks. The search_corpus RPC's p_product_name filter excludes knowledge
// rows (knowledge_items have no product_name), so a single filtered call
// would drop Cialdini-style framework grounding entirely. Two parallel
// searches keep both layers live without changing the RPC.
const VIDEO_K = 16;
const KNOWLEDGE_K = 4;

export type GenerateScriptInput = { draftId: string };

export async function generateScript({ draftId }: GenerateScriptInput): Promise<void> {
  const admin = createAdminClient();

  const { data: draft, error: draftErr } = await admin
    .from("script_drafts")
    .select(
      "id, product_id, intent, creator_gender, product_brand, product_name",
    )
    .eq("id", draftId)
    .single();
  if (draftErr || !draft) {
    throw new Error(`draft load failed: ${draftErr?.message ?? draftId}`);
  }

  // Build product context — catalog truth (main_ingredients, category). The
  // draft's denormalized product_brand/product_name is what we filter the
  // search on; the live products row gives the LLM grounding context.
  const productNameFilter = (draft.product_name as string | null) ?? null;
  const intent = draft.intent as string;
  const creatorGender = draft.creator_gender as "male" | "female" | "unknown";

  let mainIngredients: string[] = [];
  let productCategory: string[] = [];
  if (draft.product_id) {
    const { data: product, error: pErr } = await admin
      .from("products")
      .select("main_ingredients, ingredients, product_category")
      .eq("id", draft.product_id)
      .single();
    if (!pErr && product) {
      const main = (product.main_ingredients as string[] | null) ?? [];
      const fallback = (product.ingredients as string[] | null) ?? [];
      mainIngredients = main.length ? main : fallback;
      productCategory = (product.product_category as string[] | null) ?? [];
    }
  }
  const productContext = formatProductContext({
    brand: draft.product_brand as string | null,
    product_name: draft.product_name as string | null,
    main_ingredients: mainIngredients,
    product_category: productCategory,
  });

  // Run video + knowledge searches in parallel. Skip the product filter when
  // no product is attached (degraded mode — script-gen against the broader
  // corpus). creator_gender stays unfiltered so gender_specific_notes chunks
  // always surface and the LLM adapts via the user-provided gender field.
  const [videoChunks, knowledgeChunks] = await Promise.all([
    searchCorpus(
      intent,
      productNameFilter
        ? { source_type: "video", product_name: productNameFilter }
        : { source_type: "video" },
      { finalK: VIDEO_K },
    ),
    searchCorpus(
      intent,
      { source_type: "knowledge" },
      { finalK: KNOWLEDGE_K },
    ),
  ]);

  // Dedupe defensively in case the RPC ever returns the same chunk twice.
  const seen = new Set<string>();
  const grounding: RankedResult[] = [];
  for (const c of [...videoChunks, ...knowledgeChunks]) {
    if (seen.has(c.chunk_id)) continue;
    seen.add(c.chunk_id);
    grounding.push(c);
  }
  const retrievedChunkIds = grounding.map((g) => g.chunk_id);

  // Status transition + record what the LLM saw
  const { error: updErr } = await admin
    .from("script_drafts")
    .update({
      status: "generating",
      retrieved_chunk_ids: retrievedChunkIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId);
  if (updErr) throw new Error(`status → generating failed: ${updErr.message}`);

  const anthropic = new Anthropic();
  const result = await callClaudeScriptGen(anthropic, {
    productContext,
    intent,
    creatorGender,
    groundingChunks: grounding,
  });

  // Server-side citation scrub: drop any cited_chunk_id Claude invented.
  const validIds = new Set(retrievedChunkIds);
  const cleaned = scrubCitations(result.output, validIds);

  const { error: finalErr } = await admin
    .from("script_drafts")
    .update({
      status: "completed",
      output_kind: result.outputKind,
      output: cleaned,
      model: SCRIPT_GEN_MODEL,
      raw_claude_response: result.raw as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId);
  if (finalErr) throw new Error(`final persist failed: ${finalErr.message}`);
}

// Walks the LLM output, finds every `cited_chunk_ids` array, filters out ids
// not in the retrieved set. Hallucinated citations get logged and dropped
// instead of trusted into the persisted JSON.
function scrubCitations(
  output: Record<string, unknown>,
  validIds: Set<string>,
): Record<string, unknown> {
  const dropped: string[] = [];
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const obj = { ...(node as Record<string, unknown>) };
      for (const key of Object.keys(obj)) {
        if (key === "cited_chunk_ids" && Array.isArray(obj[key])) {
          const kept: string[] = [];
          for (const id of obj[key] as unknown[]) {
            if (typeof id === "string" && validIds.has(id)) kept.push(id);
            else if (typeof id === "string") dropped.push(id);
          }
          obj[key] = kept;
        } else {
          obj[key] = walk(obj[key]);
        }
      }
      return obj;
    }
    return node;
  };
  const cleaned = walk(output) as Record<string, unknown>;
  if (dropped.length) {
    console.warn(
      `script-gen: dropped ${dropped.length} hallucinated chunk_ids: ` +
        dropped.slice(0, 8).join(", ") +
        (dropped.length > 8 ? ", ..." : ""),
    );
  }
  return cleaned;
}
