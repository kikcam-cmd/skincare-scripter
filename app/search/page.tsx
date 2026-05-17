import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  loadFilterOptions,
  searchCorpus,
  type RankedResult,
  type SearchFilters,
  type SourceTypeFilter,
} from "@/lib/search/query";

type SP = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function parseFilters(sp: SP): { q: string; filters: SearchFilters } {
  const q = first(sp.q) ?? "";
  const source_type_raw = first(sp.source_type);
  const source_type: SourceTypeFilter =
    source_type_raw === "video" || source_type_raw === "knowledge"
      ? source_type_raw
      : null;
  const gender_raw = first(sp.creator_gender);
  const creator_gender =
    gender_raw === "male" || gender_raw === "female" || gender_raw === "unknown"
      ? gender_raw
      : null;
  return {
    q,
    filters: {
      source_type,
      niche_tag: first(sp.niche_tag),
      source_label: first(sp.source_label),
      creator_gender,
      brand: first(sp.brand),
      product_name: first(sp.product_name),
      ai_tag: first(sp.ai_tag),
    },
  };
}

// Builds a /search href that toggles a single key, preserving the rest.
function toggleHref(
  current: SP,
  key: string,
  value: string | null,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (k === key) continue;
    const s = first(v);
    if (s) next.set(k, s);
  }
  if (value !== null) next.set(key, value);
  const qs = next.toString();
  return qs ? `/search?${qs}` : "/search";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const { q, filters } = parseFilters(sp);
  const options = await loadFilterOptions();

  let results: RankedResult[] = [];
  let searchError: string | null = null;
  if (q.trim()) {
    try {
      results = await searchCorpus(q, filters);
    } catch (e) {
      searchError = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div className="space-y-2">
        <Link href="/" className="text-xs text-muted-foreground hover:underline">
          ← Back to upload
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground">
          Semantic search across video breakdowns + knowledge chunks. Ranks by
          cosine similarity, then re-weighted with recency, virality (videos),
          and source trust (knowledge).
        </p>
      </div>

      <form method="GET" action="/search" className="flex gap-2">
        {/* Preserve filter pill state across submits */}
        {Object.entries(sp).map(([k, v]) => {
          if (k === "q") return null;
          const s = first(v);
          if (!s) return null;
          return <input key={k} type="hidden" name={k} value={s} />;
        })}
        <Input
          name="q"
          defaultValue={q}
          placeholder='e.g. "hooks that frame the problem as the viewer fault"'
          className="flex-1"
          autoFocus
        />
        <Button type="submit">Search</Button>
      </form>

      <FilterPills sp={sp} options={options} filters={filters} />

      {searchError && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-sm text-destructive">Search failed</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap font-mono">{searchError}</pre>
          </CardContent>
        </Card>
      )}

      {!q.trim() ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Type a query to search.
          </CardContent>
        </Card>
      ) : results.length === 0 && !searchError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No results.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {results.map((r) => (
            <li key={r.chunk_id}>
              <ResultCard r={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterPills({
  sp,
  options,
  filters,
}: {
  sp: SP;
  options: Awaited<ReturnType<typeof loadFilterOptions>>;
  filters: SearchFilters;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <PillRow label="Source">
        {(["video", "knowledge"] as const).map((s) => (
          <Pill
            key={s}
            href={toggleHref(sp, "source_type", filters.source_type === s ? null : s)}
            active={filters.source_type === s}
          >
            {s}
          </Pill>
        ))}
      </PillRow>
      {options.niche_tags.length > 0 && (
        <PillRow label="Niche">
          {options.niche_tags.map((t) => (
            <Pill
              key={t}
              href={toggleHref(sp, "niche_tag", filters.niche_tag === t ? null : t)}
              active={filters.niche_tag === t}
            >
              {t}
            </Pill>
          ))}
        </PillRow>
      )}
      <PillRow label="Creator">
        {(["female", "male", "unknown"] as const).map((g) => (
          <Pill
            key={g}
            href={toggleHref(
              sp,
              "creator_gender",
              filters.creator_gender === g ? null : g,
            )}
            active={filters.creator_gender === g}
          >
            {g}
          </Pill>
        ))}
      </PillRow>
      {options.brands.length > 0 && (
        <PillRow label="Brand">
          {options.brands.map((b) => (
            <Pill
              key={b}
              href={toggleHref(sp, "brand", filters.brand === b ? null : b)}
              active={filters.brand === b}
            >
              {b}
            </Pill>
          ))}
        </PillRow>
      )}
      {options.products.length > 0 && (
        <PillRow label="Product">
          {options.products.map((p) => (
            <Pill
              key={p}
              href={toggleHref(sp, "product_name", filters.product_name === p ? null : p)}
              active={filters.product_name === p}
            >
              {p}
            </Pill>
          ))}
        </PillRow>
      )}
      {options.ai_tags.length > 0 && (
        <PillRow label="AI tag">
          {options.ai_tags.map((t) => (
            <Pill
              key={t}
              href={toggleHref(sp, "ai_tag", filters.ai_tag === t ? null : t)}
              active={filters.ai_tag === t}
            >
              {t}
            </Pill>
          ))}
        </PillRow>
      )}
      {options.source_labels.length > 0 && (
        <PillRow label="Source label">
          {options.source_labels.map((l) => (
            <Pill
              key={l}
              href={toggleHref(sp, "source_label", filters.source_label === l ? null : l)}
              active={filters.source_label === l}
            >
              {l}
            </Pill>
          ))}
        </PillRow>
      )}
    </div>
  );
}

function PillRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-xs">
      <div className="w-20 shrink-0 pt-1 font-mono uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Pill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border hover:border-foreground/40"
      }`}
    >
      {children}
    </Link>
  );
}

function ResultCard({ r }: { r: RankedResult }) {
  const pct = Math.round(r.similarity * 100);
  if (r.source_type === "video") {
    const tParam = r.t_start !== null ? `?t=${Math.floor(Number(r.t_start))}` : "";
    const href = `/videos/${r.video_id}${tParam}`;
    const cite =
      r.t_start !== null
        ? `${[r.video_brand, r.video_product_name].filter(Boolean).join(" · ") || r.video_filename || "video"} · @${formatTime(Number(r.t_start))}`
        : `${[r.video_brand, r.video_product_name].filter(Boolean).join(" · ") || r.video_filename || "video"} · ${r.chunk_kind}`;
    return (
      <Link href={href} className="block">
        <Card className="hover:border-foreground/40 transition">
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">video</Badge>
                <span className="font-mono text-muted-foreground">{cite}</span>
              </div>
              <span className="font-mono text-muted-foreground">
                {pct}% · score {r.final.toFixed(3)}
              </span>
            </div>
            <p className="text-sm line-clamp-3">{r.text}</p>
          </CardContent>
        </Card>
      </Link>
    );
  }
  const chunkParam = `?chunk=${r.chunk_index}`;
  const href = `/knowledge/${r.knowledge_item_id}${chunkParam}`;
  const cite = [
    r.knowledge_source_label || r.knowledge_title || r.knowledge_filename || "knowledge",
    r.page_number ? `p.${r.page_number}` : null,
    r.section_label,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link href={href} className="block">
      <Card className="hover:border-foreground/40 transition">
        <CardContent className="py-4 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Badge variant="outline">knowledge</Badge>
              <span className="font-mono text-muted-foreground">{cite}</span>
            </div>
            <span className="font-mono text-muted-foreground">
              {pct}% · score {r.final.toFixed(3)}
            </span>
          </div>
          <p className="text-sm line-clamp-3">{r.text}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
