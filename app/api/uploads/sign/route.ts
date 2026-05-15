import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = { filename: string; contentType: string };

export async function POST(req: Request) {
  const { filename, contentType } = (await req.json()) as Body;

  if (!filename) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }
  if (!contentType?.startsWith("video/")) {
    return NextResponse.json({ error: "contentType must be video/*" }, { status: 400 });
  }

  const ext = filename.split(".").pop()?.toLowerCase() ?? "mp4";
  // storagePath is the in-bucket path. Bucket is `videos`; we don't prefix it again.
  const storagePath = `${randomUUID()}.${ext}`;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from("videos")
    .createSignedUploadUrl(storagePath);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl, storagePath });
}
