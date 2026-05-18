// Orchestrator: embed query → call search_corpus RPC → re-rank → top 10.
//
// The RPC returns the top 30 by raw cosine distance; we then apply the
// weighted score from rank.ts and trim. PLAN §8.

import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { rankAndTrim, type RankInput } from "./rank";
import { loadTrustMap } from "./trust";

const EMBED_MODEL = "text-embedding-3-small";
const RPC_K = 30;
const FINAL_K = 10;

export type SourceTypeFilter = "video" | "knowledge" | null;

export type SearchFilters = {
  source_type?: SourceTypeFilter;
  niche_tag?: string | null;
  source_label?: string | null;
  creator_gender?: "male" | "female" | "unknown" | null;
  brand?: string | null;
  product_name?: string | null;
  ai_tag?: string | null;
  product_category?: string | null;
  active_ingredient?: string | null;
  function_claim?: string | null;
  tonality?: string | null;
};

// Mirrors the RPC return shape. Snake-case to match Postgres.
export type SearchRow = RankInput & {
  chunk_id: string;
  chunk_kind: string;
  chunk_index: number;
  text: string;
  t_start: number | null;
  t_end: number | null;
  page_number: number | null;
  section_label: string | null;
  metadata: Record<string, unknown>;
  video_id: string | null;
  knowledge_item_id: string | null;
  video_filename: string | null;
  video_niche_tag: string | null;
  video_brand: string | null;
  video_product_name: string | null;
  video_creator_gender: "male" | "female" | "unknown" | null;
  video_ai_tags: string[] | null;
  video_product_category: string[] | null;
  video_active_ingredients: string[] | null;
  video_function_claims: string[] | null;
  video_tonality: string | null;
  knowledge_title: string | null;
  knowledge_filename: string | null;
  knowledge_kind: string | null;
};

export type RankedResult = SearchRow & { final: number };

export async function searchCorpus(
  query: string,
  filters: SearchFilters = {},
): Promise<RankedResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const openai = new OpenAI();
  // Embed query + load trust map in parallel — both feed the same re-rank.
  const [embedRes, trustMap] = await Promise.all([
    openai.embeddings.create({ model: EMBED_MODEL, input: trimmed }),
    loadTrustMap(),
  ]);
  const embedding = embedRes.data[0]?.embedding;
  if (!embedding) throw new Error("search: embedding returned empty");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("search_corpus", {
    query_embedding: JSON.stringify(embedding),
    p_source_type: filters.source_type ?? null,
    p_niche_tag: filters.niche_tag ?? null,
    p_source_label: filters.source_label ?? null,
    p_creator_gender: filters.creator_gender ?? null,
    p_brand: filters.brand ?? null,
    p_product_name: filters.product_name ?? null,
    p_ai_tag: filters.ai_tag ?? null,
    p_product_category: filters.product_category ?? null,
    p_active_ingredient: filters.active_ingredient ?? null,
    p_function_claim: filters.function_claim ?? null,
    p_tonality: filters.tonality ?? null,
    k: RPC_K,
  });
  if (error) throw new Error(`search_corpus RPC failed: ${error.message}`);

  const rows = (data ?? []) as SearchRow[];
  return rankAndTrim(rows, trustMap, FINAL_K);
}

// Surfaces the filter pill options. Cheap (small distinct lists) — called from
// the search page to populate dropdowns. Returns unique non-null values.
// Tonality joins from breakdowns, not videos — Claude analysis lives there.
export async function loadFilterOptions(): Promise<{
  niche_tags: string[];
  source_labels: string[];
  brands: string[];
  products: string[];
  ai_tags: string[];
  product_categories: string[];
  active_ingredients: string[];
  function_claims: string[];
  tonalities: string[];
}> {
  const admin = createAdminClient();
  const [videosRes, knowledgeRes, breakdownsRes] = await Promise.all([
    admin.from("videos").select(
      "niche_tag, brand, product_name, ai_tags, product_category, active_ingredients, function_claims",
    ),
    admin.from("knowledge_items").select("source_label"),
    admin.from("breakdowns").select("tonality"),
  ]);
  if (videosRes.error) throw new Error(`videos read failed: ${videosRes.error.message}`);
  if (knowledgeRes.error) throw new Error(`knowledge read failed: ${knowledgeRes.error.message}`);
  if (breakdownsRes.error) throw new Error(`breakdowns read failed: ${breakdownsRes.error.message}`);

  const niche = new Set<string>();
  const brand = new Set<string>();
  const product = new Set<string>();
  const ai = new Set<string>();
  const category = new Set<string>();
  const ingredient = new Set<string>();
  const claim = new Set<string>();
  for (const v of videosRes.data ?? []) {
    if (v.niche_tag) niche.add(v.niche_tag as string);
    if (v.brand) brand.add(v.brand as string);
    if (v.product_name) product.add(v.product_name as string);
    for (const t of (v.product_category as string[] | null) ?? []) category.add(t);
    for (const t of (v.ai_tags as string[] | null) ?? []) ai.add(t);
    for (const t of (v.active_ingredients as string[] | null) ?? []) ingredient.add(t);
    for (const t of (v.function_claims as string[] | null) ?? []) claim.add(t);
  }
  const label = new Set<string>();
  for (const k of knowledgeRes.data ?? []) {
    if (k.source_label) label.add(k.source_label as string);
  }
  const tonality = new Set<string>();
  for (const b of breakdownsRes.data ?? []) {
    const t = (b.tonality as string | null)?.trim();
    if (t) tonality.add(t);
  }

  const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
  return {
    niche_tags: sort(niche),
    source_labels: sort(label),
    brands: sort(brand),
    products: sort(product),
    ai_tags: sort(ai),
    product_categories: sort(category),
    active_ingredients: sort(ingredient),
    function_claims: sort(claim),
    tonalities: sort(tonality),
  };
}
