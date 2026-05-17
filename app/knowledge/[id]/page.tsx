import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshOnPending } from "../../videos/[id]/refresh-on-pending";

const TERMINAL: ReadonlyArray<string> = ["embedded", "failed"];

export default async function KnowledgeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("knowledge_items")
    .select("*")
    .eq("id", id)
    .single();
  if (!item) notFound();

  const { data: chunks } = await supabase
    .from("corpus_chunks")
    .select("id, chunk_index, text, page_number, section_label")
    .eq("knowledge_item_id", id)
    .order("chunk_index", { ascending: true });

  const isPending = !TERMINAL.includes(item.status);
  const title = item.title || item.filename || `${item.kind} · ${id.slice(0, 8)}`;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      {isPending && <RefreshOnPending intervalMs={3000} />}

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/knowledge"
            className="text-xs text-muted-foreground hover:underline"
          >
            ← Back
          </Link>
          <h1 className="text-xl font-semibold tracking-tight break-all">{title}</h1>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span>{id}</span>
            <span>·</span>
            <span>{item.kind}</span>
            {item.source_label && (
              <>
                <span>·</span>
                <span>{item.source_label}</span>
              </>
            )}
          </div>
        </div>
        <Badge variant={item.status === "failed" ? "destructive" : "secondary"}>
          {item.status}
        </Badge>
      </div>

      {item.status === "failed" && item.error_message && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-sm text-destructive">Pipeline failed</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap font-mono">
              {item.error_message}
            </pre>
          </CardContent>
        </Card>
      )}

      {isPending && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Pipeline running… (page auto-refreshes every 3s)
          </CardContent>
        </Card>
      )}

      {chunks && chunks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {chunks.length} chunk{chunks.length === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {chunks.map((c) => {
                const tag = formatCitation(c.page_number as number | null, c.section_label as string | null);
                return (
                  <li key={c.id as string} className="py-3 space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                      #{c.chunk_index}
                      {tag && ` · ${tag}`}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{c.text as string}</p>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <form action={`/api/knowledge/${id}/retry`} method="post">
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          Re-run pipeline
        </Button>
      </form>
    </div>
  );
}

function formatCitation(
  page: number | null,
  section: string | null,
): string | null {
  const parts: string[] = [];
  if (page) parts.push(`p.${page}`);
  if (section) parts.push(section);
  return parts.length > 0 ? parts.join(" · ") : null;
}
