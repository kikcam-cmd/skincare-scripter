import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ScriptResult, type ChunkMeta } from "./script-result";

export const dynamic = "force-dynamic";

type Params = { id: string };

type DraftRow = {
  id: string;
  status: string;
  intent: string;
  product_brand: string | null;
  product_name: string | null;
  creator_gender: string;
  output_kind: string | null;
  output: Record<string, unknown> | null;
  retrieved_chunk_ids: string[] | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type CorpusChunkRow = {
  id: string;
  chunk_kind: string;
  text: string;
  video_id: string | null;
  knowledge_item_id: string | null;
  videos:
    | { brand: string | null; product_name: string | null; filename: string | null }
    | { brand: string | null; product_name: string | null; filename: string | null }[]
    | null;
  knowledge_items:
    | { title: string | null; filename: string | null; source_label: string | null }
    | { title: string | null; filename: string | null; source_label: string | null }[]
    | null;
};

export default async function ScriptDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const draftRes = await admin
    .from("script_drafts")
    .select(
      "id, status, intent, product_brand, product_name, creator_gender, " +
        "output_kind, output, retrieved_chunk_ids, error_message, " +
        "created_at, updated_at",
    )
    .eq("id", id)
    .single();
  if (draftRes.error || !draftRes.data) notFound();
  const draft = draftRes.data as unknown as DraftRow;

  // Load metadata for cited chunks so the result page can render
  // brand·product·kind labels with a hover-preview of the chunk text.
  const ids = draft.retrieved_chunk_ids ?? [];
  const chunkMeta = new Map<string, ChunkMeta>();
  if (ids.length) {
    const chunksRes = await admin
      .from("corpus_chunks")
      .select(
        "id, chunk_kind, text, video_id, knowledge_item_id, " +
          "videos(brand, product_name, filename), " +
          "knowledge_items(title, filename, source_label)",
      )
      .in("id", ids);
    const chunks = (chunksRes.data ?? []) as unknown as CorpusChunkRow[];
    for (const c of chunks) {
      const video = Array.isArray(c.videos) ? c.videos[0] ?? null : c.videos;
      const knowledge = Array.isArray(c.knowledge_items)
        ? c.knowledge_items[0] ?? null
        : c.knowledge_items;
      const source = video
        ? `${video.brand ?? "?"} · ${video.product_name ?? "?"}`
        : knowledge
          ? `${knowledge.source_label ?? knowledge.title ?? knowledge.filename ?? "?"}`
          : "?";
      chunkMeta.set(c.id, {
        id: c.id,
        kind: c.chunk_kind,
        text: c.text,
        source,
        videoId: c.video_id,
        knowledgeItemId: c.knowledge_item_id,
      });
    }
  }

  const status = draft.status;
  const isTerminal = status === "completed" || status === "failed";

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div className="space-y-2">
        <Link
          href="/scripts"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Back to scripts
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {draft.product_brand && draft.product_name
            ? `${draft.product_brand} · ${draft.product_name}`
            : "(no product)"}
        </h1>
        <p className="text-sm text-muted-foreground">
          <span className="italic">&ldquo;{draft.intent}&rdquo;</span> · creator:{" "}
          {draft.creator_gender}
        </p>
      </div>

      {!isTerminal && <PendingPanel status={status} />}

      {status === "failed" && (
        <div className="rounded border border-red-400 bg-red-50 p-4 text-sm space-y-2">
          <p className="font-medium text-red-700">Generation failed</p>
          <p className="text-red-600 whitespace-pre-wrap">
            {draft.error_message ?? "(no error message)"}
          </p>
          <Link
            href="/scripts/new"
            className="text-xs text-red-700 underline inline-block"
          >
            Start a new one →
          </Link>
        </div>
      )}

      {status === "completed" && draft.output_kind && draft.output ? (
        <ScriptResult
          kind={draft.output_kind}
          output={draft.output}
          chunkMeta={chunkMeta}
          retrievedCount={ids.length}
        />
      ) : null}
    </div>
  );
}

function PendingPanel({ status }: { status: string }) {
  return (
    <>
      {/* Poll every 2s while non-terminal — server component re-renders fully. */}
      <meta httpEquiv="refresh" content="2" />
      <div className="rounded border bg-muted/30 p-6 text-center text-sm">
        {status === "retrieving" && "Retrieving grounding chunks…"}
        {status === "generating" && "Synthesizing script…"}
      </div>
    </>
  );
}
