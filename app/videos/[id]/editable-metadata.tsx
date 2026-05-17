"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Gender = "male" | "female" | "unknown";

export type VideoMetadataFields = {
  creator_handle: string | null;
  view_count: number | null;
  posted_at: string | null; // YYYY-MM-DD
  niche_tag: string | null;
  brand: string | null;
  product_name: string | null;
  creator_gender: Gender;
  user_notes: string | null;
  ai_tags: string[];
};

export type Suggestions = {
  niche_tags: string[];
  brands: string[];
  products: string[];
};

export function EditableMetadata({
  videoId,
  initial,
  suggestions,
}: {
  videoId: string;
  initial: VideoMetadataFields;
  suggestions: Suggestions;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<VideoMetadataFields>(initial);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator_handle: form.creator_handle,
          view_count: form.view_count,
          posted_at: form.posted_at,
          niche_tag: form.niche_tag,
          brand: form.brand,
          product_name: form.product_name,
          creator_gender: form.creator_gender,
          user_notes: form.user_notes,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `PATCH failed: ${res.status}`);
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => {
    setForm(initial);
    setError(null);
    setEditing(false);
  };

  if (!editing) {
    return <ViewCard initial={initial} onEdit={() => setEditing(true)} />;
  }

  return (
    <Card>
      <CardContent className="py-4 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Creator handle" htmlFor="creator_handle">
            <Input
              id="creator_handle"
              placeholder="@username"
              value={form.creator_handle ?? ""}
              onChange={(e) =>
                setForm({ ...form, creator_handle: e.target.value })
              }
            />
          </Field>
          <Field label="View count" htmlFor="view_count">
            <Input
              id="view_count"
              type="number"
              min={0}
              placeholder="e.g. 250000"
              value={form.view_count ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  view_count: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="Posted date" htmlFor="posted_at">
            <Input
              id="posted_at"
              type="date"
              value={form.posted_at ?? ""}
              onChange={(e) => setForm({ ...form, posted_at: e.target.value })}
            />
          </Field>
          <Field label="Niche tag" htmlFor="niche_tag">
            <Input
              id="niche_tag"
              list="niche-tags-list"
              placeholder="e.g. korean-skincare"
              value={form.niche_tag ?? ""}
              onChange={(e) => setForm({ ...form, niche_tag: e.target.value })}
            />
            <datalist id="niche-tags-list">
              {suggestions.niche_tags.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="Brand" htmlFor="brand">
            <Input
              id="brand"
              list="brands-list"
              placeholder="e.g. Medicube"
              value={form.brand ?? ""}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
            />
            <datalist id="brands-list">
              {suggestions.brands.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field label="Product" htmlFor="product_name">
            <Input
              id="product_name"
              list="products-list"
              placeholder="e.g. Zero Pore Blackhead Mud Mask"
              value={form.product_name ?? ""}
              onChange={(e) =>
                setForm({ ...form, product_name: e.target.value })
              }
            />
            <datalist id="products-list">
              {suggestions.products.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
        </div>

        <Field label="Creator gender">
          <div className="flex gap-2">
            {(["female", "male", "unknown"] as Gender[]).map((g) => (
              <Button
                key={g}
                type="button"
                size="sm"
                variant={form.creator_gender === g ? "default" : "outline"}
                onClick={() => setForm({ ...form, creator_gender: g })}
              >
                {g}
              </Button>
            ))}
          </div>
        </Field>

        <Field label="Notes" htmlFor="user_notes">
          <textarea
            id="user_notes"
            rows={3}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            placeholder="Anything you want Claude to know about this video."
            value={form.user_notes ?? ""}
            onChange={(e) => setForm({ ...form, user_notes: e.target.value })}
          />
        </Field>

        {form.ai_tags.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
              AI tags (Claude-generated, not editable)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {form.ai_tags.map((tag) => (
                <Badge key={tag} variant="outline" className="font-mono text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive font-mono">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ViewCard({
  initial,
  onEdit,
}: {
  initial: VideoMetadataFields;
  onEdit: () => void;
}) {
  const {
    creator_handle: handle,
    view_count: views,
    posted_at: posted,
    niche_tag: niche,
    brand,
    product_name: product,
    creator_gender: gender,
    user_notes: notes,
    ai_tags: aiTags,
  } = initial;

  return (
    <Card>
      <CardContent className="py-4 space-y-2 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {handle && (
              <span>
                <span className="text-muted-foreground">Handle:</span> {handle}
              </span>
            )}
            {views !== null && (
              <span>
                <span className="text-muted-foreground">Views:</span>{" "}
                {views.toLocaleString()}
              </span>
            )}
            {posted && (
              <span>
                <span className="text-muted-foreground">Posted:</span> {posted}
              </span>
            )}
            {niche && (
              <span>
                <span className="text-muted-foreground">Niche:</span> {niche}
              </span>
            )}
            {brand && (
              <span>
                <span className="text-muted-foreground">Brand:</span> {brand}
              </span>
            )}
            {product && (
              <span>
                <span className="text-muted-foreground">Product:</span> {product}
              </span>
            )}
            {gender !== "unknown" && (
              <span>
                <span className="text-muted-foreground">Creator:</span> {gender}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="shrink-0"
          >
            Edit
          </Button>
        </div>

        {notes && (
          <div>
            <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
              Notes
            </div>
            <div className="mt-1 whitespace-pre-wrap">{notes}</div>
          </div>
        )}

        {aiTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {aiTags.map((tag) => (
              <Badge key={tag} variant="outline" className="font-mono text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
