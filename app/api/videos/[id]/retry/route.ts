import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processVideo } from "@/lib/pipeline/video";

export const runtime = "nodejs";
export const maxDuration = 800;

// Slice 1 retry: re-run the full single-shot pipeline. There's no step gating
// yet (Slice 3) so this re-bills Groq + Claude. Also clears any prior breakdown
// row so the pipeline can re-insert without a PK conflict.
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = createAdminClient();

  await supabase.from("breakdowns").delete().eq("video_id", id);
  await supabase
    .from("videos")
    .update({ status: "uploaded", error_message: null })
    .eq("id", id);

  after(async () => {
    try {
      await processVideo({ videoId: id });
    } catch (err) {
      const message = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      await createAdminClient()
        .from("videos")
        .update({ status: "failed", error_message: message })
        .eq("id", id);
    }
  });

  return NextResponse.redirect(new URL(`/videos/${id}`, _req.url), { status: 303 });
}
