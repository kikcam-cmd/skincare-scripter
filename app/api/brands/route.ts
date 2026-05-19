import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

type Body = { name?: string };

function slugify(input: string): string | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s === "" ? null : s;
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const slug = slugify(name);
  if (!slug) {
    return NextResponse.json({ error: "name must contain alphanumerics" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("brands")
    .insert({ name, slug })
    .select("id, name, slug")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
  }
  revalidatePath("/products");
  return NextResponse.json({ brand: data });
}
