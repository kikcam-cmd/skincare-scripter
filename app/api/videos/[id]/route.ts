import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// Editable fields on /videos/[id]. Mirror the upload form + the three fields
// that were never collectable before (creator_handle, view_count, posted_at,
// niche_tag). Empty strings → null so the DB sees NULL not "".

type Body = {
  creator_handle?: string | null;
  view_count?: number | string | null;
  posted_at?: string | null; // YYYY-MM-DD (Postgres date)
  niche_tag?: string | null;
  brand?: string | null;
  product_name?: string | null;
  creator_gender?: "male" | "female" | "unknown";
  user_notes?: string | null;
};

const VALID_GENDERS = new Set(["male", "female", "unknown"]);

function nullIfEmpty(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function parseViewCount(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as Body;

  const gender =
    body.creator_gender && VALID_GENDERS.has(body.creator_gender)
      ? body.creator_gender
      : "unknown";

  const update = {
    creator_handle: nullIfEmpty(body.creator_handle),
    view_count: parseViewCount(body.view_count),
    posted_at: nullIfEmpty(body.posted_at),
    niche_tag: nullIfEmpty(body.niche_tag),
    brand: nullIfEmpty(body.brand),
    product_name: nullIfEmpty(body.product_name),
    creator_gender: gender,
    user_notes: nullIfEmpty(body.user_notes),
    updated_at: new Date().toISOString(),
  };

  const supabase = createAdminClient();
  const { error } = await supabase.from("videos").update(update).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Propagate the three fields that pipeline/video.ts denormalized into
  // corpus_chunks.metadata (niche_tag, view_count, creator_handle). The Slice 6
  // search RPC filters niche_tag via the videos JOIN, so search correctness is
  // unaffected — but the indexed `metadata->>'niche_tag'` would go stale, and
  // any future code reading metadata directly would see old values.
  const { data: chunks, error: readErr } = await supabase
    .from("corpus_chunks")
    .select("id, metadata")
    .eq("video_id", id);
  if (readErr) {
    return NextResponse.json(
      { error: `corpus_chunks read failed: ${readErr.message}` },
      { status: 500 },
    );
  }
  if (chunks && chunks.length > 0) {
    const updates = chunks.map((c) => ({
      id: c.id as string,
      metadata: {
        ...((c.metadata as Record<string, unknown>) ?? {}),
        niche_tag: update.niche_tag,
        view_count: update.view_count,
        creator_handle: update.creator_handle,
      },
    }));
    // supabase-js has no batch UPDATE; loop is fine at v0 corpus size (<100
    // chunks per video).
    for (const u of updates) {
      const { error: upErr } = await supabase
        .from("corpus_chunks")
        .update({ metadata: u.metadata })
        .eq("id", u.id);
      if (upErr) {
        return NextResponse.json(
          { error: `corpus_chunks update failed: ${upErr.message}` },
          { status: 500 },
        );
      }
    }
  }

  revalidatePath("/videos/[id]", "page");
  return NextResponse.json({ ok: true });
}
