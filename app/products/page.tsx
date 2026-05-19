import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductRow } from "./product-row";
import { NewProductForm } from "./new-product-form";

export const dynamic = "force-dynamic";

type ProductRowData = {
  id: string;
  brand_id: string;
  name: string;
  main_ingredients: string[];
  ingredients: string[];
  product_category: string[];
  brand_claims: string[];
  source_url: string | null;
  notes: string | null;
};

export default async function ProductsPage() {
  const admin = createAdminClient();
  const [brandsRes, productsRes, videoCountRes] = await Promise.all([
    admin.from("brands").select("id, name").order("name"),
    admin
      .from("products")
      .select(
        "id, brand_id, name, main_ingredients, ingredients, product_category, brand_claims, source_url, notes",
      )
      .order("name"),
    admin.from("videos").select("product_id").not("product_id", "is", null),
  ]);
  if (brandsRes.error) throw new Error(brandsRes.error.message);
  if (productsRes.error) throw new Error(productsRes.error.message);
  if (videoCountRes.error) throw new Error(videoCountRes.error.message);

  const brands = (brandsRes.data ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
  }));
  const brandById = new Map(brands.map((b) => [b.id, b.name]));

  const videoCounts = new Map<string, number>();
  for (const v of videoCountRes.data ?? []) {
    const pid = v.product_id as string | null;
    if (!pid) continue;
    videoCounts.set(pid, (videoCounts.get(pid) ?? 0) + 1);
  }

  const products = (productsRes.data ?? []) as ProductRowData[];
  const byBrand = new Map<string, ProductRowData[]>();
  for (const p of products) {
    const list = byBrand.get(p.brand_id) ?? [];
    list.push(p);
    byBrand.set(p.brand_id, list);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div className="space-y-2">
        <Link href="/" className="text-xs text-muted-foreground hover:underline">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="text-sm text-muted-foreground">
          Canonical brand + product catalog. The Whisper transcription prompt
          seeds from these ingredients per upload, so {`"Volufiline"`} gets
          recognized instead of {`"Valofulin"`}. Per-video extractions on
          <code className="px-1 text-xs">videos.active_ingredients[]</code>{" "}
          capture the creator-spoken version, which can differ from canonical.
        </p>
      </div>

      <NewProductForm brands={brands} />

      {brands.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground text-center">
            No brands yet. Use “+ New product” above to add the first one.
          </CardContent>
        </Card>
      ) : (
        brands.map((b) => {
          const items = byBrand.get(b.id) ?? [];
          return (
            <Card key={b.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {b.name}{" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    · {items.length} product{items.length === 1 ? "" : "s"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No products under this brand yet.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {items.map((p) => (
                      <ProductRow
                        key={p.id}
                        id={p.id}
                        initialBrandId={p.brand_id}
                        initialName={p.name}
                        initialMainIngredients={p.main_ingredients ?? []}
                        initialIngredients={p.ingredients ?? []}
                        initialProductCategory={p.product_category ?? []}
                        initialBrandClaims={p.brand_claims ?? []}
                        initialSourceUrl={p.source_url}
                        initialNotes={p.notes}
                        videoCount={videoCounts.get(p.id) ?? 0}
                        brands={brands}
                      />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Surface any orphaned brands that have no products yet */}
      {brandById.size > 0 && (
        <p className="text-xs text-muted-foreground text-center pt-4">
          {products.length} product{products.length === 1 ? "" : "s"} across{" "}
          {brands.length} brand{brands.length === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
