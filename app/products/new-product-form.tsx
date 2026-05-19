"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Brand = { id: string; name: string };

export function NewProductForm({ brands }: { brands: Brand[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [brandId, setBrandId] = useState<string>(brands[0]?.id ?? "");
  const [name, setName] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCreateBrand = async () => {
    const trimmed = newBrandName.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `POST /api/brands failed: ${res.status}`);
      }
      const { brand } = (await res.json()) as { brand: Brand };
      router.refresh();
      setBrandId(brand.id);
      setNewBrandName("");
      setCreatingBrand(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onCreateProduct = async () => {
    if (!brandId) {
      setError("pick a brand or create one");
      return;
    }
    if (!name.trim()) {
      setError("product name required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: brandId,
          name: name.trim(),
          ingredients,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `POST /api/products failed: ${res.status}`);
      }
      router.refresh();
      setName("");
      setIngredients("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          + New product
        </Button>
      </div>
    );
  }

  return (
    <div className="border rounded-md p-4 space-y-3 bg-muted/20">
      <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
        New product
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <Field label="Brand">
          {!creatingBrand ? (
            <div className="flex gap-2">
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="flex-1 h-9 px-3 rounded-md border bg-background text-sm"
              >
                {brands.length === 0 && <option value="">(none — add one)</option>}
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setCreatingBrand(true)}
              >
                + New
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                placeholder="Brand name"
                className="flex-1 h-9 px-3 rounded-md border bg-background text-sm"
              />
              <Button
                type="button"
                size="sm"
                onClick={onCreateBrand}
                disabled={saving || !newBrandName.trim()}
              >
                Add
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCreatingBrand(false);
                  setNewBrandName("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </Field>
        <Field label="Product name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="BP Spicule Plumping Lip Shot"
            className="w-full h-9 px-3 rounded-md border bg-background text-sm"
          />
        </Field>
      </div>
      <Field label="Ingredients seed (comma or newline; you can edit later)">
        <textarea
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          rows={3}
          placeholder="volufiline, hyaluronic-acid, peptides"
          className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono resize-y"
        />
      </Field>
      <div className="flex items-center justify-end gap-2">
        {error && (
          <span className="text-xs text-destructive font-mono">{error}</span>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={onCreateProduct} disabled={saving}>
          {saving ? "Creating…" : "Create"}
        </Button>
      </div>
    </div>
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
