import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = { filename: string; kind: "pdf" | "md" | "txt" };

const ALLOWED_KINDS = new Set(["pdf", "md", "txt"]);

// Sign-route doesn't validate MIME — browsers report `text/markdown`
// inconsistently (Chrome often empty, Safari `text/plain`). The client knows
// which tab the user picked, so it tells us via `kind`. The bucket itself
// enforces an allow-list of MIME types as a backstop.
export async function POST(req: Request) {
  const { filename, kind } = (await req.json()) as Body;
  if (!filename) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }
  if (!kind || !ALLOWED_KINDS.has(kind)) {
    return NextResponse.json(
      { error: `kind must be one of: ${[...ALLOWED_KINDS].join(", ")}` },
      { status: 400 },
    );
  }

  const ext = kind === "pdf" ? "pdf" : kind === "md" ? "md" : "txt";
  const storagePath = `${randomUUID()}.${ext}`;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from("knowledge")
    .createSignedUploadUrl(storagePath);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl, storagePath });
}
