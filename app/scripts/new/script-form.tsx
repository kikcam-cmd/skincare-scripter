"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Brand = { id: string; name: string };
type Product = { id: string; brand_id: string; name: string };

export function ScriptForm({
  brands,
  products,
}: {
  brands: Brand[];
  products: Product[];
}) {
  const router = useRouter();
  const [productId, setProductId] = useState<string>("");
  const [intent, setIntent] = useState("");
  const [creatorGender, setCreatorGender] = useState<
    "male" | "female" | "unknown"
  >("unknown");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!intent.trim()) {
      setError("Describe what you want.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/scripts/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: productId || null,
          intent: intent.trim(),
          creatorGender,
        }),
      });
      const json = (await res.json()) as { draftId?: string; error?: string };
      if (!res.ok || !json.draftId) {
        setError(json.error ?? "Generation failed");
        setSubmitting(false);
        return;
      }
      router.push(`/scripts/${json.draftId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
      setSubmitting(false);
    }
  }

  const productsByBrand = new Map<string, Product[]>();
  for (const p of products) {
    const list = productsByBrand.get(p.brand_id) ?? [];
    list.push(p);
    productsByBrand.set(p.brand_id, list);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium block">Product</label>
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="w-full rounded border px-3 py-2 text-sm bg-background"
        >
          <option value="">— No product (broad corpus search) —</option>
          {brands.map((b) => {
            const items = productsByBrand.get(b.id) ?? [];
            if (items.length === 0) return null;
            return (
              <optgroup key={b.id} label={b.name}>
                {items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium block">Creator gender</label>
        <div className="flex gap-2">
          {(["female", "male", "unknown"] as const).map((g) => (
            <button
              type="button"
              key={g}
              onClick={() => setCreatorGender(g)}
              className={`px-3 py-1.5 rounded text-sm border ${
                creatorGender === g
                  ? "bg-foreground text-background border-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {g === "unknown"
                ? "Unspecified"
                : g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium block">What do you want?</label>
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          rows={3}
          placeholder="e.g. viral hook ideas, full script with before-after demo, comment-reply CTA"
          className="w-full rounded border px-3 py-2 text-sm bg-background font-sans"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {submitting ? "Generating…" : "Generate"}
      </button>
    </form>
  );
}
