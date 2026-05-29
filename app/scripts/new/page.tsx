import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ScriptForm } from "./script-form";

export const dynamic = "force-dynamic";

export default async function NewScriptPage() {
  const admin = createAdminClient();
  const [brandsRes, productsRes] = await Promise.all([
    admin.from("brands").select("id, name").order("name"),
    admin.from("products").select("id, brand_id, name").order("name"),
  ]);
  if (brandsRes.error) throw new Error(brandsRes.error.message);
  if (productsRes.error) throw new Error(productsRes.error.message);

  const brands = (brandsRes.data ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
  }));
  const products = (productsRes.data ?? []).map((p) => ({
    id: p.id as string,
    brand_id: p.brand_id as string,
    name: p.name as string,
  }));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div className="space-y-2">
        <Link
          href="/scripts"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Back to scripts
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New script</h1>
        <p className="text-sm text-muted-foreground">
          Pick a product, describe what you want in your own words, generate.
          Examples: <em>&quot;viral hook ideas&quot;</em>, <em>&quot;full script
          with before-after demo&quot;</em>, <em>&quot;comment-reply CTA targeting
          40+ women&quot;</em>.
        </p>
      </div>
      <ScriptForm brands={brands} products={products} />
    </div>
  );
}
