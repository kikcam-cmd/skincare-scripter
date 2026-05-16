import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processVideo } from "@/lib/pipeline/video";

export const runtime = "nodejs";
export const maxDuration = 800;

// Slice 2 retry: re-run the full single-shot pipeline. Still no step gating
// (Slice 3 problem) so this re-bills Groq + Claude. Clears every child row
// for the video AND wipes the JPGs from storage so the pipeline can re-insert
// without unique-constraint conflicts.
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = createAdminClient();

  // List + remove every JPG under frames/{id}/ — covers both recorded
  // key_frames and any orphan from a prior failed run.
  const { data: framesList } = await supabase.storage
    .from("videos")
    .list(`frames/${id}`);
  if (framesList && framesList.length > 0) {
    await supabase.storage
      .from("videos")
      .remove(framesList.map((f) => `frames/${id}/${f.name}`));
  }

  await supabase.from("breakdowns").delete().eq("video_id", id);
  await supabase.from("key_frames").delete().eq("video_id", id);
  await supabase.from("transcript_chunks").delete().eq("video_id", id);
  await supabase.from("transcripts").delete().eq("video_id", id);
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
