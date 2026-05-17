import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshOnPending } from "./refresh-on-pending";
import { StudyTool } from "./study-tool";
import { SimilarVideos } from "./similar-videos";

const TERMINAL: ReadonlyArray<string> = ["analyzed", "embedded", "failed", "duplicate"];
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — page re-renders refresh.

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

  const [{ data: breakdown }, { data: chunks }, { data: frames }] = await Promise.all([
    supabase.from("breakdowns").select("*").eq("video_id", id).maybeSingle(),
    supabase
      .from("transcript_chunks")
      .select("id, chunk_index, text, t_start, t_end")
      .eq("video_id", id)
      .order("chunk_index", { ascending: true }),
    supabase
      .from("key_frames")
      .select("frame_index, t_seconds, storage_path")
      .eq("video_id", id)
      .order("frame_index", { ascending: true }),
  ]);

  // Signed URLs require the service_role key (videos bucket is private). The
  // whole app is behind a Basic Auth proxy so generating these in an RSC is OK.
  const admin = createAdminClient();
  const videoUrlPromise = admin.storage
    .from("videos")
    .createSignedUrl(video.storage_path, SIGNED_URL_TTL_SECONDS);
  const framePaths = (frames ?? []).map((f) => f.storage_path);
  const framesUrlsPromise =
    framePaths.length > 0
      ? admin.storage.from("videos").createSignedUrls(framePaths, SIGNED_URL_TTL_SECONDS)
      : Promise.resolve({ data: [] as { signedUrl: string }[], error: null });
  const [videoUrlRes, framesUrlsRes] = await Promise.all([videoUrlPromise, framesUrlsPromise]);

  const videoUrl = videoUrlRes.data?.signedUrl ?? null;
  const signedFrames = (frames ?? []).map((f, i) => ({
    frame_index: f.frame_index,
    t_seconds: Number(f.t_seconds),
    signed_url: framesUrlsRes.data?.[i]?.signedUrl ?? "",
  }));
  const typedChunks = (chunks ?? []).map((c) => ({
    id: c.id as string,
    chunk_index: c.chunk_index as number,
    text: c.text as string,
    t_start: Number(c.t_start),
    t_end: Number(c.t_end),
  }));

  const isPending = !TERMINAL.includes(video.status);

  // Similar videos: only fetch once this video itself has been embedded —
  // the RPC keys off the breakdown_summary chunk, which doesn't exist
  // before STEP 4. Returns [] if no other videos are embedded yet.
  type SimilarRow = {
    video_id: string;
    similarity: number;
    filename: string;
    niche_tag: string | null;
    first_frame_path: string | null;
  };
  let similarItems: {
    video_id: string;
    similarity: number;
    filename: string;
    niche_tag: string | null;
    thumbnail_url: string | null;
  }[] = [];
  if (video.status === "embedded") {
    const { data: similar } = await admin.rpc("similar_videos", {
      target_id: id,
      k: 5,
    });
    const rows = (similar as SimilarRow[] | null) ?? [];
    const thumbPaths = rows
      .map((r) => r.first_frame_path)
      .filter((p): p is string => !!p);
    const { data: signed } =
      thumbPaths.length > 0
        ? await admin.storage
            .from("videos")
            .createSignedUrls(thumbPaths, SIGNED_URL_TTL_SECONDS)
        : { data: [] as { signedUrl: string }[] };
    const pathToUrl = new Map<string, string>();
    thumbPaths.forEach((p, i) => {
      const url = signed?.[i]?.signedUrl;
      if (url) pathToUrl.set(p, url);
    });
    similarItems = rows.map((r) => ({
      video_id: r.video_id,
      similarity: r.similarity,
      filename: r.filename,
      niche_tag: r.niche_tag,
      thumbnail_url: r.first_frame_path
        ? pathToUrl.get(r.first_frame_path) ?? null
        : null,
    }));
  }

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

      {videoUrl && (
        <StudyTool videoUrl={videoUrl} chunks={typedChunks} frames={signedFrames} />
      )}

      {isPending && !breakdown && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Pipeline running… (page auto-refreshes every 3s)
          </CardContent>
        </Card>
      )}

      {breakdown && (
        <>
          <BreakdownSummary breakdown={breakdown} />
          {video.status === "embedded" && <SimilarVideos items={similarItems} />}
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
