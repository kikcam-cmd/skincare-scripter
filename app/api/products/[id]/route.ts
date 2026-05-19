import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTokens } from "@/lib/normalize-tokens";

// Edit a product. Updates products row, and when name/brand_id changes,
// propagates the new brand_name + product_name into videos.brand /
// videos.product_name cache columns on related rows (the Slice 6 search RPC
// reads those denormalized values).

type Body = {
  brand_id?: string;
  name?: string | null;
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as Body;
  const admin = createAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("products")
    .select("id, brand_id, name, slug")
    .eq("id", id)
    .single();
  if (readErr || !existing) {
    return NextResponse.json(
      { error: readErr?.message ?? "product not found" },
      { status: 404 },
    );
  }

  const nextName = nullIfEmpty(body.name);
  if (body.name !== undefined && !nextName) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
  }
  const nextSlug = nextName ? slugify(nextName) : null;
  if (body.name !== undefined && !nextSlug) {
    return NextResponse.json(
      { error: "name must contain alphanumerics" },
      { status: 400 },
    );
  }
  const nextBrandId = body.brand_id?.trim() || null;

  const update: Record<string, unknown> = {
    ingredients: normalizeTokens(body.ingredients),
    product_category: normalizeTokens(body.product_category),
    brand_claims: normalizeTokens(body.brand_claims),
    source_url: nullIfEmpty(body.source_url),
    notes: nullIfEmpty(body.notes),
    updated_at: new Date().toISOString(),
  };
  if (nextName) {
    update.name = nextName;
    update.slug = nextSlug;
  }
  if (nextBrandId) {
    update.brand_id = nextBrandId;
  }

  const { error: updErr } = await admin
    .from("products")
    .update(update)
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const nameChanged = nextName && nextName !== existing.name;
  const brandChanged = nextBrandId && nextBrandId !== existing.brand_id;
  if (nameChanged || brandChanged) {
    // Look up the (possibly new) brand name to write into videos.brand cache.
    const brandIdToFetch = nextBrandId ?? (existing.brand_id as string);
    const { data: brand, error: bErr } = await admin
      .from("brands")
      .select("name")
      .eq("id", brandIdToFetch)
      .single();
    if (bErr || !brand) {
      return NextResponse.json(
        { error: `brand lookup failed: ${bErr?.message}` },
        { status: 500 },
      );
    }
    const { error: vErr } = await admin
      .from("videos")
      .update({
        brand: brand.name,
        product_name: nextName ?? existing.name,
        updated_at: new Date().toISOString(),
      })
      .eq("product_id", id);
    if (vErr) {
      return NextResponse.json(
        { error: `videos cache propagation failed: ${vErr.message}` },
        { status: 500 },
      );
    }
  }

  revalidatePath("/products");
  return NextResponse.json({ ok: true });
}
