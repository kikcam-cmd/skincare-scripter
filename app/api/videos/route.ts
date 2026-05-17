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
  viewCount?: number;
  nicheTag?: string;
  creatorGender?: "male" | "female" | "unknown";
  brand?: string | null;
  productName?: string | null;
  userNotes?: string | null;
};

const VALID_GENDERS = new Set(["male", "female", "unknown"]);

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
  const { data: video, error } = await supabase
    .from("videos")
    .insert({
      storage_path: body.storagePath,
      filename: body.filename,
      creator_handle: body.creatorHandle ?? null,
      view_count: body.viewCount ?? null,
      niche_tag: body.nicheTag ?? null,
      creator_gender: creatorGender,
      brand: body.brand ?? null,
      product_name: body.productName ?? null,
      user_notes: body.userNotes ?? null,
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
