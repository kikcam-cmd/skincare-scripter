"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TrustRow({
  label,
  initialWeight,
  initialNotes,
  source,
}: {
  label: string;
  initialWeight: number;
  initialNotes: string | null;
  source: "trust" | "knowledge" | "both";
}) {
  const router = useRouter();
  const [weight, setWeight] = useState<string>(String(initialWeight));
  const [notes, setNotes] = useState<string>(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    const w = parseFloat(weight);
    if (!Number.isFinite(w) || w < 0 || w > 2) {
      setError("weight must be a number in [0, 2]");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch("/api/trust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, weight: w, notes: notes || null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `POST failed: ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="py-3 grid grid-cols-[1fr_6rem_auto] sm:grid-cols-[1fr_6rem_1fr_auto] items-start gap-3">
      <div className="space-y-1 min-w-0">
        <div className="font-mono text-sm truncate">{label}</div>
        <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
          {source === "both"
            ? "in trust table + used by knowledge"
            : source === "trust"
              ? "in trust table only"
              : "used by knowledge — default 1.0"}
        </div>
      </div>
      <Input
        type="number"
        step="0.05"
        min={0}
        max={2}
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        className="font-mono text-sm"
      />
      <Input
        placeholder="optional notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="text-sm sm:block hidden"
      />
      <div className="flex flex-col gap-1 items-end">
        <Button type="button" size="sm" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {error && (
          <span className="text-xs text-destructive font-mono whitespace-nowrap">
            {error}
          </span>
        )}
      </div>
    </li>
  );
}
