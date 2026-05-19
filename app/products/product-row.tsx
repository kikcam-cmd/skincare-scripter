"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Brand = { id: string; name: string };

export function ProductRow({
  id,
  initialBrandId,
  initialName,
  initialIngredients,
  initialProductCategory,
  initialBrandClaims,
  initialSourceUrl,
  initialNotes,
  videoCount,
  brands,
}: {
  id: string;
  initialBrandId: string;
  initialName: string;
  initialIngredients: string[];
  initialProductCategory: string[];
  initialBrandClaims: string[];
  initialSourceUrl: string | null;
  initialNotes: string | null;
  videoCount: number;
  brands: Brand[];
}) {
  const router = useRouter();
  const [brandId, setBrandId] = useState(initialBrandId);
  const [name, setName] = useState(initialName);
  const [ingredients, setIngredients] = useState(initialIngredients.join(", "));
  const [productCategory, setProductCategory] = useState(initialProductCategory.join(", "));
  const [brandClaims, setBrandClaims] = useState(initialBrandClaims.join(", "));
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: brandId,
          name,
          ingredients,
          product_category: productCategory,
          brand_claims: brandClaims,
          source_url: sourceUrl,
          notes,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `PATCH failed: ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const ingredientCount = ingredients
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean).length;

  return (
    <li className="py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-sm truncate">{initialName}</div>
          <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
            {ingredientCount} ingredient{ingredientCount === 1 ? "" : "s"} ·{" "}
            {videoCount} video{videoCount === 1 ? "" : "s"}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? "Edit" : "Close"}
        </Button>
      </div>

      {!collapsed && (
        <div className="mt-3 space-y-3 border rounded-md p-3 bg-muted/20">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Brand">
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="w-full h-9 px-3 rounded-md border bg-background text-sm"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 rounded-md border bg-background text-sm"
              />
            </Field>
          </div>
          <Field label="Ingredients (comma or newline separated)">
            <textarea
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono resize-y"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Canonical product category">
              <textarea
                value={productCategory}
                onChange={(e) => setProductCategory(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono resize-y"
              />
            </Field>
            <Field label="Brand claims (what the BRAND legally says)">
              <textarea
                value={brandClaims}
                onChange={(e) => setBrandClaims(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono resize-y"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Source URL (optional)">
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://brand.com/product"
                className="w-full h-9 px-3 rounded-md border bg-background text-sm"
              />
            </Field>
            <Field label="Notes (optional)">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full h-9 px-3 rounded-md border bg-background text-sm"
              />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-2">
            {error && (
              <span className="text-xs text-destructive font-mono">{error}</span>
            )}
            <Button type="button" size="sm" onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
