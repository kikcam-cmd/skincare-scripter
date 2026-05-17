import OpenAI from "openai";
import { extractText, getDocumentProxy } from "unpdf";
import { lexer, type Token } from "marked";
import { createAdminClient } from "@/lib/supabase/admin";

const EMBED_MODEL = "text-embedding-3-small";

// Char-based proxy for token count. Targets ~500 tokens (~2000 chars) per
// chunk; capped at 6000 chars so dense single-block input can't blow past
// the 8192-token embedding limit. Acceptable v0 deviation from PLAN.md §7
// (which calls for js-tiktoken) — we can swap in a real token counter when
// chunking accuracy actually bites.
const TARGET_CHARS = 2000;
const MAX_CHARS = 6000;

type Block = {
  text: string;
  page_number: number | null;
  section_label: string | null;
};

type Chunk = {
  text: string;
  page_number: number | null;
  section_label: string | null;
};

type KnowledgeRow = {
  id: string;
  kind: "pdf" | "md" | "txt" | "pasted";
  storage_path: string | null;
  filename: string | null;
  title: string | null;
  source_label: string | null;
  pasted_text: string | null;
};

const KIND_TO_CHUNK_KIND: Record<KnowledgeRow["kind"], string> = {
  pdf: "pdf_page",
  md: "md_section",
  txt: "txt_block",
  pasted: "pasted_block",
};

export async function processKnowledge({
  knowledgeItemId,
}: {
  knowledgeItemId: string;
}): Promise<void> {
  const supabase = createAdminClient();

  const { data: item, error: iErr } = await supabase
    .from("knowledge_items")
    .select("id, kind, storage_path, filename, title, source_label, pasted_text")
    .eq("id", knowledgeItemId)
    .single();
  if (iErr || !item)
    throw new Error(`knowledge_item ${knowledgeItemId} not found: ${iErr?.message}`);
  const k = item as KnowledgeRow;

  // STEP 1 gate: any corpus_chunks row for this knowledge_item → already done.
  const { count: existingCount } = await supabase
    .from("corpus_chunks")
    .select("id", { count: "exact", head: true })
    .eq("knowledge_item_id", knowledgeItemId);
  if (existingCount) {
    await supabase
      .from("knowledge_items")
      .update({ status: "embedded", error_message: null })
      .eq("id", knowledgeItemId);
    return;
  }

  // Parse → blocks.
  let blocks: Block[];
  switch (k.kind) {
    case "pdf":
      blocks = await parsePdf(supabase, k.storage_path!);
      break;
    case "md":
      blocks = parseMarkdown(await readKnowledgeFile(supabase, k.storage_path!));
      break;
    case "txt":
      blocks = parsePlain(await readKnowledgeFile(supabase, k.storage_path!));
      break;
    case "pasted":
      blocks = parsePlain(k.pasted_text!);
      break;
  }

  // Mid-status: parsed, not yet embedded. Reuses 'transcribed' from the shared
  // enum — videos and knowledge share pipeline_status, and 'transcribed' here
  // just means "raw text is extracted." Cleaner would be a new enum value, but
  // adding values to a Postgres enum is heavy for a label-only change.
  await supabase
    .from("knowledge_items")
    .update({ status: "transcribed" })
    .eq("id", knowledgeItemId);

  const chunks = chunkBlocks(blocks);
  if (chunks.length === 0)
    throw new Error("STEP knowledge: parse produced zero non-empty chunks");

  const openai = new OpenAI();
  const embedRes = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: chunks.map((c) => c.text),
  });

  const metadata = {
    source_label: k.source_label,
    title: k.title,
    filename: k.filename,
    kind: k.kind,
  };
  const chunkKind = KIND_TO_CHUNK_KIND[k.kind];

  const { error: ccErr } = await supabase.from("corpus_chunks").upsert(
    chunks.map((c, idx) => ({
      source_type: "knowledge",
      knowledge_item_id: knowledgeItemId,
      chunk_kind: chunkKind,
      chunk_index: idx,
      text: c.text,
      embedding: JSON.stringify(embedRes.data[idx].embedding),
      page_number: c.page_number,
      section_label: c.section_label,
      metadata,
    })),
    {
      onConflict: "knowledge_item_id,chunk_kind,chunk_index",
      ignoreDuplicates: true,
    },
  );
  if (ccErr) throw new Error(`corpus_chunks insert failed: ${ccErr.message}`);

  await supabase
    .from("knowledge_items")
    .update({ status: "embedded", error_message: null })
    .eq("id", knowledgeItemId);
}

async function readKnowledgeFile(
  supabase: ReturnType<typeof createAdminClient>,
  storagePath: string,
): Promise<string> {
  const { data: blob, error } = await supabase.storage
    .from("knowledge")
    .download(storagePath);
  if (error || !blob)
    throw new Error(`knowledge download failed (${storagePath}): ${error?.message}`);
  return await blob.text();
}

async function parsePdf(
  supabase: ReturnType<typeof createAdminClient>,
  storagePath: string,
): Promise<Block[]> {
  const { data: blob, error } = await supabase.storage
    .from("knowledge")
    .download(storagePath);
  if (error || !blob)
    throw new Error(`pdf download failed (${storagePath}): ${error?.message}`);
  const buf = new Uint8Array(await blob.arrayBuffer());
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return pages
    .map((pageText, idx) => ({
      text: (pageText ?? "").trim(),
      page_number: idx + 1,
      section_label: null as string | null,
    }))
    .filter((b) => b.text.length > 0);
}

// Walk the marked token list with a "last heading seen" cursor. Treat each
// paragraph/list-item/code/blockquote as one block, attaching the most recent
// heading text as section_label.
function parseMarkdown(text: string): Block[] {
  const tokens = lexer(text);
  const out: Block[] = [];
  let currentHeading: string | null = null;

  const isBlockToken = (t: Token): t is Token & { raw: string } =>
    typeof (t as { raw?: unknown }).raw === "string";

  const walk = (toks: Token[]) => {
    for (const t of toks) {
      if (t.type === "heading") {
        const h = t as Token & { text: string };
        currentHeading = h.text.trim() || currentHeading;
        continue;
      }
      if (
        t.type === "paragraph" ||
        t.type === "blockquote" ||
        t.type === "code" ||
        t.type === "html"
      ) {
        if (isBlockToken(t)) {
          const raw = t.raw.trim();
          if (raw.length > 0)
            out.push({ text: raw, page_number: null, section_label: currentHeading });
        }
      } else if (t.type === "list") {
        const list = t as Token & { items: Array<{ raw: string }> };
        for (const li of list.items) {
          const raw = (li.raw ?? "").trim();
          if (raw.length > 0)
            out.push({ text: raw, page_number: null, section_label: currentHeading });
        }
      }
    }
  };

  walk(tokens);
  if (out.length === 0 && text.trim().length > 0)
    out.push({ text: text.trim(), page_number: null, section_label: null });
  return out;
}

// TXT and pasted: split on blank lines into paragraph-ish blocks. Empty input
// yields one block with the trimmed input as a fallback.
function parsePlain(text: string): Block[] {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paras.length === 0) {
    const trimmed = text.trim();
    return trimmed.length > 0
      ? [{ text: trimmed, page_number: null, section_label: null }]
      : [];
  }
  return paras.map((p) => ({ text: p, page_number: null, section_label: null }));
}

// Greedy pack: append blocks to the current chunk while under TARGET_CHARS;
// flush when adding the next block would exceed it. Oversized single blocks
// (> MAX_CHARS) get sentence-split before packing. page_number on a chunk is
// the first page that contributed; section_label is the first label.
function chunkBlocks(blocks: Block[]): Chunk[] {
  const out: Chunk[] = [];
  let bufText: string[] = [];
  let bufLen = 0;
  let bufPage: number | null = null;
  let bufSection: string | null = null;

  const flush = () => {
    if (bufText.length === 0) return;
    out.push({
      text: bufText.join("\n\n"),
      page_number: bufPage,
      section_label: bufSection,
    });
    bufText = [];
    bufLen = 0;
    bufPage = null;
    bufSection = null;
  };

  const push = (text: string, page: number | null, section: string | null) => {
    const len = text.length;
    if (bufLen + len > TARGET_CHARS && bufText.length > 0) flush();
    if (bufText.length === 0) {
      bufPage = page;
      bufSection = section;
    }
    bufText.push(text);
    bufLen += len + 2;
  };

  for (const b of blocks) {
    if (b.text.length > MAX_CHARS) {
      for (const sentence of splitOversized(b.text, MAX_CHARS)) {
        push(sentence, b.page_number, b.section_label);
      }
    } else {
      push(b.text, b.page_number, b.section_label);
    }
  }
  flush();
  return out;
}

// Sentence-aware split for oversized blocks. Falls back to hard char-window
// if a single "sentence" still exceeds maxChars (e.g. minified text).
function splitOversized(text: string, maxChars: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (s.length > maxChars) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      for (let i = 0; i < s.length; i += maxChars) out.push(s.slice(i, i + maxChars));
      continue;
    }
    if (buf.length + s.length + 1 > maxChars) {
      out.push(buf);
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf) out.push(buf);
  return out;
}
