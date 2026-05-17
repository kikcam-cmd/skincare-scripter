import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrustRow } from "./trust-row";

// This page reads source_trust + knowledge_items at request time and reflects
// edits made via /api/trust. Without force-dynamic, Next prerenders it at
// build time and the row list goes stale until the next deploy.
export const dynamic = "force-dynamic";

type Source = "trust" | "knowledge" | "both";
type Row = {
  label: string;
  weight: number;
  notes: string | null;
  source: Source;
};

export default async function TrustPage() {
  const admin = createAdminClient();
  const [trustRes, kRes] = await Promise.all([
    admin.from("source_trust").select("label, weight, notes"),
    admin.from("knowledge_items").select("source_label"),
  ]);

  if (trustRes.error) throw new Error(trustRes.error.message);
  if (kRes.error) throw new Error(kRes.error.message);

  const trustMap = new Map<string, { weight: number; notes: string | null }>();
  for (const r of trustRes.data ?? []) {
    trustMap.set(r.label as string, {
      weight: Number(r.weight),
      notes: (r.notes as string | null) ?? null,
    });
  }

  const knowledgeLabels = new Set<string>();
  for (const r of kRes.data ?? []) {
    const l = r.source_label as string | null;
    if (l) knowledgeLabels.add(l);
  }

  const rows: Row[] = [];
  for (const [label, v] of trustMap) {
    rows.push({
      label,
      weight: v.weight,
      notes: v.notes,
      source: knowledgeLabels.has(label) ? "both" : "trust",
    });
  }
  for (const label of knowledgeLabels) {
    if (!trustMap.has(label)) {
      rows.push({ label, weight: 1.0, notes: null, source: "knowledge" });
    }
  }
  rows.sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div className="space-y-2">
        <Link href="/" className="text-xs text-muted-foreground hover:underline">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Source trust</h1>
        <p className="text-sm text-muted-foreground">
          Per source_label weights feeding the search re-rank. Range 0–2;
          default 1.0. The ranker normalizes to a 0–1 boost on knowledge
          results (0.05× contribution to the final score). See PLAN §8.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {rows.length} source{rows.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No source labels yet. Add a knowledge item with a source_label
              to populate this list.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => (
                <TrustRow
                  key={r.label}
                  label={r.label}
                  initialWeight={r.weight}
                  initialNotes={r.notes}
                  source={r.source}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
