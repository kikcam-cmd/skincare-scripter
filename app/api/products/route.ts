import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTokens } from "@/lib/normalize-tokens";

type Body = {
  brand_id?: string;
  name?: string;
  main_ingredients?: string | string[];
  ingredients?: string | string[];
  product_category?: string | string[];
  brand_claims?: string | string[];
  source_url?: string | null;
  notes?: string | null;
};

function slugify(input: string): string | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s === "" ? null : s;
}

function nullIfEmpty(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const name = body.name?.trim();
  const brandId = body.brand_id?.trim();
  if (!brandId) {
    return NextResponse.json({ error: "brand_id required" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const slug = slugify(name);
  if (!slug) {
    return NextResponse.json({ error: "name must contain alphanumerics" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("products")
    .insert({
      brand_id: brandId,
      name,
      slug,
      main_ingredients: normalizeTokens(body.main_ingredients),
      ingredients: normalizeTokens(body.ingredients),
      product_category: normalizeTokens(body.product_category),
      brand_claims: normalizeTokens(body.brand_claims),
      source_url: nullIfEmpty(body.source_url),
      notes: nullIfEmpty(body.notes),
    })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
  }
  revalidatePath("/products");
  return NextResponse.json({ productId: data.id });
}
