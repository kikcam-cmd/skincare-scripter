import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processVideo } from "@/lib/pipeline/video";

// 800s is shared across the response + after() callback (Pro/Fluid budget).
// The HTTP response returns immediately; after() runs the pipeline within the
// remaining budget — typical 60s TikTok takes ~40-75s end-to-end.
export const runtime = "nodejs";
export const maxDuration = 800;

type Body = {
  storagePath: string;
  filename: string;
  creatorHandle?: string;
  viewCount?: number | null;
  nicheTag?: string;
  postedAt?: string | null; // YYYY-MM-DD
  creatorGender?: "male" | "female" | "unknown";
  productId?: string | null;
  userNotes?: string | null;
  gmvUsd?: number | null;
  itemsSold?: number | null;
};

const VALID_GENDERS = new Set(["male", "female", "unknown"]);

function nullIfEmpty(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function parseNonNegNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;

  if (!body.storagePath || !body.filename) {
    return NextResponse.json(
      { error: "storagePath and filename required" },
      { status: 400 },
    );
  }

  const creatorGender =
    body.creatorGender && VALID_GENDERS.has(body.creatorGender)
      ? body.creatorGender
      : "unknown";

  const supabase = createAdminClient();

  // Look up product → derive brand + product_name cache from the catalog.
  // Free-text brand/product is no longer accepted; client always picks from
  // /products. Optional (null product_id falls back to legacy generic Whisper
  // prompt + empty brand/product on the video row).
  let cachedBrand: string | null = null;
  let cachedProductName: string | null = null;
  const productId = body.productId?.trim() || null;
  if (productId) {
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("name, brands(name)")
      .eq("id", productId)
      .single();
    if (pErr || !product) {
      return NextResponse.json(
        { error: `product not found: ${pErr?.message ?? productId}` },
        { status: 400 },
      );
    }
    cachedProductName = product.name as string;
    const brand = product.brands as { name: string } | { name: string }[] | null;
    cachedBrand = Array.isArray(brand) ? brand[0]?.name ?? null : brand?.name ?? null;
  }

  const { data: video, error } = await supabase
    .from("videos")
    .insert({
      storage_path: body.storagePath,
      filename: body.filename,
      creator_handle: body.creatorHandle ?? null,
      view_count: parseNonNegNumber(body.viewCount),
      niche_tag: body.nicheTag ?? null,
      posted_at: nullIfEmpty(body.postedAt),
      creator_gender: creatorGender,
      product_id: productId,
      brand: cachedBrand,
      product_name: cachedProductName,
      user_notes: body.userNotes ?? null,
      gmv_usd: parseNonNegNumber(body.gmvUsd),
      items_sold: parseNonNegNumber(body.itemsSold),
      status: "uploaded",
    })
    .select("id")
    .single();

  if (error || !video) {
    return NextResponse.json(
      { error: error?.message ?? "insert failed" },
      { status: 500 },
    );
  }

  // Pipeline runs after response is sent, within the same 800s budget.
  after(async () => {
    try {
      await processVideo({ videoId: video.id });
    } catch (err) {
      const message = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      await createAdminClient()
        .from("videos")
        .update({ status: "failed", error_message: message })
        .eq("id", video.id);
    }
  });

  return NextResponse.json({ videoId: video.id });
}
