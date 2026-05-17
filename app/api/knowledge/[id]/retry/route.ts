import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processKnowledge } from "@/lib/pipeline/knowledge";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = createAdminClient();

  await supabase
    .from("knowledge_items")
    .update({ status: "uploaded", error_message: null })
    .eq("id", id);

  after(async () => {
    try {
      await processKnowledge({ knowledgeItemId: id });
    } catch (err) {
      const message = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      await createAdminClient()
        .from("knowledge_items")
        .update({ status: "failed", error_message: message })
        .eq("id", id);
    }
  });

  return NextResponse.redirect(new URL(`/knowledge/${id}`, _req.url), { status: 303 });
}
