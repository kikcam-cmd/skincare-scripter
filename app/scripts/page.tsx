import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type DraftRow = {
  id: string;
  status: string;
  intent: string;
  product_brand: string | null;
  product_name: string | null;
  output_kind: string | null;
  created_at: string;
};

export default async function ScriptsPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("script_drafts")
    .select(
      "id, status, intent, product_brand, product_name, output_kind, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  const drafts = (data ?? []) as DraftRow[];

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:underline"
          >
            ← Back
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Scripts</h1>
          <p className="text-sm text-muted-foreground">
            Slice 0 prototype. Pick a product, state what you want, generate.
            Iterate freely — no auth, no history scoping, just the brain.
          </p>
        </div>
        <Link
          href="/scripts/new"
          className="rounded bg-foreground text-background px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          + New script
        </Link>
      </div>

      {drafts.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No drafts yet.{" "}
          <Link href="/scripts/new" className="underline">
            Generate your first.
          </Link>
        </div>
      ) : (
        <ul className="divide-y">
          {drafts.map((d) => (
            <li key={d.id}>
              <Link
                href={`/scripts/${d.id}`}
                className="block py-3 px-2 rounded hover:bg-muted/40"
              >
                <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
                  <span className="truncate">
                    {d.product_brand && d.product_name
                      ? `${d.product_brand} · ${d.product_name}`
                      : "(no product)"}
                  </span>
                  <span className="whitespace-nowrap font-mono">
                    {d.output_kind ?? d.status} ·{" "}
                    {new Date(d.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm mt-1 line-clamp-2">{d.intent}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
