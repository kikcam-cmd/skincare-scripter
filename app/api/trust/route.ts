import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// Upsert a source_trust row. POST body: { label: string, weight: number,
// notes?: string }. Weight constrained to [0, 2] by DB CHECK; we also clamp
// here so the failure mode is a clean 400 instead of a Postgres error.

type Body = {
  label?: string;
  weight?: number;
  notes?: string | null;
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const label = body.label?.trim();
  const weight = typeof body.weight === "number" ? body.weight : NaN;
  if (!label) {
    return NextResponse.json({ error: "label required" }, { status: 400 });
  }
  if (!Number.isFinite(weight) || weight < 0 || weight > 2) {
    return NextResponse.json(
      { error: "weight must be a number in [0, 2]" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from("source_trust").upsert(
    {
      label,
      weight,
      notes: body.notes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "label" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/trust");
  return NextResponse.json({ ok: true });
}
