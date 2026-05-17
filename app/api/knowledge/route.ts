import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processKnowledge } from "@/lib/pipeline/knowledge";

export const runtime = "nodejs";
// 300s matches PLAN.md §1 budget — large PDFs can spend tens of seconds in
// unpdf. after() runs the pipeline within the route lifetime.
export const maxDuration = 300;

type Kind = "pdf" | "md" | "txt" | "pasted";

type Body = {
  kind: Kind;
  storagePath?: string;
  filename?: string;
  pastedText?: string;
  title?: string;
  sourceLabel?: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;

  if (!body.kind || !["pdf", "md", "txt", "pasted"].includes(body.kind)) {
    return NextResponse.json({ error: "kind must be pdf|md|txt|pasted" }, { status: 400 });
  }
  if (body.kind === "pasted") {
    if (!body.pastedText || body.pastedText.trim().length === 0) {
      return NextResponse.json(
        { error: "pastedText required for kind=pasted" },
        { status: 400 },
      );
    }
  } else {
    if (!body.storagePath || !body.filename) {
      return NextResponse.json(
        { error: "storagePath + filename required for file kinds" },
        { status: 400 },
      );
    }
  }

  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from("knowledge_items")
    .insert({
      kind: body.kind,
      storage_path: body.kind === "pasted" ? null : body.storagePath ?? null,
      filename: body.kind === "pasted" ? null : body.filename ?? null,
      pasted_text: body.kind === "pasted" ? body.pastedText ?? null : null,
      title: body.title?.trim() || null,
      source_label: body.sourceLabel?.trim() || null,
      status: "uploaded",
    })
    .select("id")
    .single();

  if (error || !row) {
    return NextResponse.json(
      { error: error?.message ?? "insert failed" },
      { status: 500 },
    );
  }

  after(async () => {
    try {
      await processKnowledge({ knowledgeItemId: row.id });
    } catch (err) {
      const message = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      await createAdminClient()
        .from("knowledge_items")
        .update({ status: "failed", error_message: message })
        .eq("id", row.id);
    }
  });

  return NextResponse.json({ knowledgeItemId: row.id });
}
