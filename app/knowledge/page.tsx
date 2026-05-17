import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KnowledgeForm } from "./knowledge-form";

export default async function KnowledgePage() {
  const supabase = await createClient();
  const { data: recent } = await supabase
    .from("knowledge_items")
    .select("id, kind, filename, title, source_label, status, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
      <div className="space-y-2">
        <Link href="/" className="text-xs text-muted-foreground hover:underline">
          ← Back to videos
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1>
        <p className="text-sm text-muted-foreground">
          PDFs, markdown, plain text, or pasted snippets. Each item is parsed,
          chunked, embedded, and added to the searchable corpus.
        </p>
      </div>

      <KnowledgeForm />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent knowledge</CardTitle>
        </CardHeader>
        <CardContent>
          {!recent || recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((k) => (
                <li
                  key={k.id}
                  className="py-2 flex items-center justify-between gap-3 text-sm"
                >
                  <Link
                    href={`/knowledge/${k.id}`}
                    className="hover:underline truncate max-w-[60%]"
                  >
                    {k.title || k.filename || `${k.kind} · ${k.id.slice(0, 8)}`}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono text-muted-foreground">
                      {k.kind}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {k.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
