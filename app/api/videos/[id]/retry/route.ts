import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processVideo } from "@/lib/pipeline/video";

export const runtime = "nodejs";
export const maxDuration = 800;

// Slice 3 retry: pipeline is step-gated by DB existence checks, so retry is
// a plain "run it again." Each step skips if its output already exists,
// meaning a "kill mid-Claude-call → retry" resumes without re-billing Groq
// or re-extracting frames. The route just clears error state and bumps
// status to a non-terminal value so the detail page resumes polling.
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = createAdminClient();

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
