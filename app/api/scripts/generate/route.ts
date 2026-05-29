import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateScript } from "@/lib/scripts/generate";

// 120s budget — single retrieval + single Sonnet 4.6 call. ~10-30s typical.
export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  productId?: string | null;
  intent: string;
  creatorGender?: "male" | "female" | "unknown";
};

const VALID_GENDERS = new Set(["male", "female", "unknown"]);

export async function POST(req: Request) {
  const body = (await req.json()) as Body;

  const intent = body.intent?.trim();
  if (!intent) {
    return NextResponse.json({ error: "intent required" }, { status: 400 });
  }

  const creatorGender =
    body.creatorGender && VALID_GENDERS.has(body.creatorGender)
      ? body.creatorGender
      : "unknown";

  const admin = createAdminClient();

  // Look up product → denormalize brand + name at insert time so future
  // product renames don't retroactively rewrite the draft and so the
  // result page can render without an extra join.
  let productId: string | null = null;
  let productBrand: string | null = null;
  let productName: string | null = null;
  if (body.productId) {
    const { data: product, error: pErr } = await admin
      .from("products")
      .select("id, name, brands(name)")
      .eq("id", body.productId)
      .single();
    if (pErr || !product) {
      return NextResponse.json(
        { error: `product not found: ${pErr?.message ?? body.productId}` },
        { status: 400 },
      );
    }
    productId = product.id as string;
    productName = product.name as string;
    const brand = product.brands as { name: string } | { name: string }[] | null;
    productBrand = Array.isArray(brand) ? brand[0]?.name ?? null : brand?.name ?? null;
  }

  const { data: draft, error } = await admin
    .from("script_drafts")
    .insert({
      product_id: productId,
      product_brand: productBrand,
      product_name: productName,
      intent,
      creator_gender: creatorGender,
      status: "retrieving",
    })
    .select("id")
    .single();

  if (error || !draft) {
    return NextResponse.json(
      { error: error?.message ?? "insert failed" },
      { status: 500 },
    );
  }

  // Single-shot generation; no retry route. If it fails the user re-submits.
  after(async () => {
    try {
      await generateScript({ draftId: draft.id });
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 400) : String(err);
      await createAdminClient()
        .from("script_drafts")
        .update({
          status: "failed",
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft.id);
    }
  });

  return NextResponse.json({ draftId: draft.id });
}
