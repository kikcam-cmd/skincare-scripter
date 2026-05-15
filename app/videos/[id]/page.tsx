import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshOnPending } from "./refresh-on-pending";

const TERMINAL: ReadonlyArray<string> = ["analyzed", "embedded", "failed", "duplicate"];

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: video } = await supabase
    .from("videos")
    .select("*")
    .eq("id", id)
    .single();
  if (!video) notFound();

  const { data: breakdown } = await supabase
    .from("breakdowns")
    .select("*")
    .eq("video_id", id)
    .maybeSingle();

  const isPending = !TERMINAL.includes(video.status);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      {isPending && <RefreshOnPending intervalMs={3000} />}

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/" className="text-xs text-muted-foreground hover:underline">
            ← Back
          </Link>
          <h1 className="text-xl font-semibold tracking-tight break-all">{video.filename}</h1>
          <p className="text-xs font-mono text-muted-foreground">{video.id}</p>
        </div>
        <Badge variant={video.status === "failed" ? "destructive" : "secondary"}>
          {video.status}
        </Badge>
      </div>

      {video.status === "failed" && video.error_message && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-sm text-destructive">Pipeline failed</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap font-mono">{video.error_message}</pre>
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

      {breakdown && (
        <>
          <BreakdownSummary breakdown={breakdown} />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-mono">raw breakdown JSON</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs overflow-x-auto whitespace-pre-wrap font-mono">
                {JSON.stringify(breakdown, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </>
      )}

      <form action={`/api/videos/${id}/retry`} method="post">
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          Re-run pipeline
        </Button>
      </form>
    </div>
  );
}

function BreakdownSummary({ breakdown }: { breakdown: Record<string, unknown> }) {
  const spans = ["hook", "problem", "twist", "solution", "cta"] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {spans.map((key) => {
          const span = breakdown[key] as { text?: string; t_start?: number; t_end?: number } | null;
          if (!span) return null;
          return (
            <div key={key}>
              <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
                {key} · {span.t_start?.toFixed(1)}–{span.t_end?.toFixed(1)}s
              </div>
              <div className="text-sm mt-1">{span.text}</div>
            </div>
          );
        })}
        <div>
          <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
            Male creator relevance
          </div>
          <div className="text-sm mt-1">{breakdown.male_creator_relevance as string}</div>
        </div>
      </CardContent>
    </Card>
  );
}
