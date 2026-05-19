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
import {
  EditableMetadata,
  type ProductOption,
  type Suggestions,
  type VideoMetadataFields,
} from "./editable-metadata";
import { SeekButton } from "./seek-button";

const TERMINAL: ReadonlyArray<string> = ["analyzed", "embedded", "failed", "duplicate"];
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — page re-renders refresh.

export default async function VideoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const initialT =
    sp.t !== undefined && !Number.isNaN(parseFloat(sp.t))
      ? parseFloat(sp.t)
      : undefined;
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

  // Distinct suggestion lists for the metadata edit form. Cheap at v0 scale;
  // promote to a dedicated helper if other surfaces need the same data.
  const [{ data: allMeta }, { data: productsRaw }] = await Promise.all([
    admin
      .from("videos")
      .select("niche_tag, brand, product_name, product_category, active_ingredients, function_claims")
      .neq("id", id),
    admin
      .from("products")
      .select("id, name, brands(name)")
      .order("name"),
  ]);
  const productsList: ProductOption[] = (productsRaw ?? []).map((p) => {
    const brand = p.brands as { name: string } | { name: string }[] | null;
    const brandName = Array.isArray(brand) ? brand[0]?.name : brand?.name;
    return {
      id: p.id as string,
      name: p.name as string,
      brand: brandName ?? "(no brand)",
    };
  });
  const suggestions: Suggestions = (() => {
    const niche = new Set<string>();
    const brand = new Set<string>();
    const product = new Set<string>();
    const category = new Set<string>();
    const ingredient = new Set<string>();
    const claim = new Set<string>();
    for (const v of allMeta ?? []) {
      if (v.niche_tag) niche.add(v.niche_tag as string);
      if (v.brand) brand.add(v.brand as string);
      if (v.product_name) product.add(v.product_name as string);
      for (const t of (v.product_category as string[] | null) ?? []) category.add(t);
      for (const t of (v.active_ingredients as string[] | null) ?? []) ingredient.add(t);
      for (const t of (v.function_claims as string[] | null) ?? []) claim.add(t);
    }
    const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
    return {
      niche_tags: sort(niche),
      brands: sort(brand),
      products: sort(product),
      product_categories: sort(category),
      active_ingredients: sort(ingredient),
      function_claims: sort(claim),
    };
  })();

  const metadataInitial: VideoMetadataFields = {
    creator_handle: (video.creator_handle as string | null) ?? null,
    view_count:
      video.view_count === null || video.view_count === undefined
        ? null
        : Number(video.view_count),
    posted_at: (video.posted_at as string | null) ?? null,
    niche_tag: (video.niche_tag as string | null) ?? null,
    product_id: (video.product_id as string | null) ?? null,
    brand: (video.brand as string | null) ?? null,
    product_name: (video.product_name as string | null) ?? null,
    creator_gender:
      ((video.creator_gender as "male" | "female" | "unknown" | null) ?? "unknown"),
    user_notes: (video.user_notes as string | null) ?? null,
    ai_tags: Array.isArray(video.ai_tags) ? (video.ai_tags as string[]) : [],
    product_category: Array.isArray(video.product_category)
      ? (video.product_category as string[])
      : [],
    active_ingredients: Array.isArray(video.active_ingredients)
      ? (video.active_ingredients as string[])
      : [],
    function_claims: Array.isArray(video.function_claims)
      ? (video.function_claims as string[])
      : [],
    gmv_usd:
      video.gmv_usd === null || video.gmv_usd === undefined ? null : Number(video.gmv_usd),
    items_sold:
      video.items_sold === null || video.items_sold === undefined
        ? null
        : Number(video.items_sold),
  };

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

      <EditableMetadata
        videoId={id}
        initial={metadataInitial}
        suggestions={suggestions}
        products={productsList}
      />


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
        <StudyTool
          videoUrl={videoUrl}
          chunks={typedChunks}
          frames={signedFrames}
          initialT={initialT}
        />
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
          const t = span.t_start;
          return (
            <div key={key}>
              {typeof t === "number" ? (
                <SeekButton t={t}>
                  {key} · {t.toFixed(1)}–{span.t_end?.toFixed(1)}s
                </SeekButton>
              ) : (
                <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
                  {key}
                </div>
              )}
              <div className="text-sm mt-1">{span.text}</div>
            </div>
          );
        })}
        {breakdown.gender_specific_notes ? (
          <div>
            <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
              Gender-specific notes
            </div>
            <div className="text-sm mt-1">{breakdown.gender_specific_notes as string}</div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
