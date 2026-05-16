import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { callClaudeBreakdown, BREAKDOWN_MODEL } from "@/lib/prompts/breakdown";
import {
  probeDuration,
  extractAudio,
  extractFrames,
  frameTargetCount,
} from "@/lib/pipeline/ffmpeg";
import { sha256File } from "@/lib/pipeline/hash";

type GroqWord = { word: string; start: number; end: number };
type GroqVerboseTranscription = {
  text: string;
  language?: string;
  words?: GroqWord[];
};

// Statuses that count as "real work has happened" — used to decide whether
// another video with the same content_hash should be treated as a duplicate.
// 'failed' and 'duplicate' rows are excluded so a re-upload after a failed
// run can succeed.
const DEDUP_TARGET_STATUSES = [
  "transcribed",
  "frames_extracted",
  "analyzed",
  "embedded",
];

// Slice 3 pipeline: step-gated by DB existence checks. Each step skips its
// external API call if its output already exists. STEP 0 computes the
// content hash and marks the video as a duplicate of any prior successful
// upload. processVideo() can be called any number of times for the same
// videoId and will only do the work that's still missing.
export async function processVideo({ videoId }: { videoId: string }): Promise<void> {
  const supabase = createAdminClient();

  const { data: video, error: vErr } = await supabase
    .from("videos")
    .select(
      "id, storage_path, filename, content_hash, creator_handle, view_count, niche_tag, duration_seconds",
    )
    .eq("id", videoId)
    .single();
  if (vErr || !video) throw new Error(`video ${videoId} not found: ${vErr?.message}`);

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `scripter-${videoId}-`));
  const localMp4 = path.join(tmp, "in.mp4");

  try {
    // download MP4 from storage (always — needed for hash + ffmpeg steps; STEP 3
    // alone could skip this, but the cost is ~2s and the simpler code wins)
    const { data: blob, error: dErr } = await supabase.storage
      .from("videos")
      .download(video.storage_path);
    if (dErr || !blob) throw new Error(`download failed: ${dErr?.message}`);
    const buf = Buffer.from(await blob.arrayBuffer());
    await fs.writeFile(localMp4, buf);

    const duration = video.duration_seconds ?? (await probeDuration(localMp4));
    if (!video.duration_seconds) {
      await supabase
        .from("videos")
        .update({ duration_seconds: duration })
        .eq("id", videoId);
    }

    // STEP 0: dedup — compute hash if missing, mark as duplicate of any prior
    // successful upload. Hash is cheap relative to Groq + Claude; running it
    // first means a duplicate aborts before any paid API call.
    if (!video.content_hash) {
      const hash = await sha256File(localMp4);
      const { data: dup } = await supabase
        .from("videos")
        .select("id")
        .eq("content_hash", hash)
        .neq("id", videoId)
        .in("status", DEDUP_TARGET_STATUSES)
        .maybeSingle();
      if (dup) {
        await supabase
          .from("videos")
          .update({
            content_hash: hash,
            status: "duplicate",
            error_message: `duplicate of ${dup.id}`,
          })
          .eq("id", videoId);
        return;
      }
      await supabase.from("videos").update({ content_hash: hash }).eq("id", videoId);
    }

    // STEP 1: transcript — gate by transcripts row existence
    const { data: transcriptRow } = await supabase
      .from("transcripts")
      .select("video_id")
      .eq("video_id", videoId)
      .maybeSingle();
    if (!transcriptRow) {
      const audioPath = path.join(tmp, "audio.mp3");
      await extractAudio(localMp4, audioPath);

      const groq = new Groq();
      const transcription = (await groq.audio.transcriptions.create({
        file: createReadStream(audioPath),
        model: "whisper-large-v3-turbo",
        response_format: "verbose_json",
        timestamp_granularities: ["word"],
      })) as unknown as GroqVerboseTranscription;

      const lines = chunkByWordWindow(transcription.words ?? [], 600);

      const { error: tErr } = await supabase.from("transcripts").insert({
        video_id: videoId,
        full_text: transcription.text,
        language: transcription.language ?? null,
        raw_groq_response: transcription as unknown as Record<string, unknown>,
      });
      if (tErr) throw new Error(`transcripts insert failed: ${tErr.message}`);

      if (lines.length > 0) {
        const { error: tcErr } = await supabase.from("transcript_chunks").insert(
          lines.map((line, idx) => ({
            video_id: videoId,
            chunk_index: idx,
            text: line.text,
            t_start: line.t_start,
            t_end: line.t_end,
          })),
        );
        if (tcErr) throw new Error(`transcript_chunks insert failed: ${tcErr.message}`);
      }

      await supabase
        .from("videos")
        .update({ status: "transcribed" })
        .eq("id", videoId);
    }

    // STEP 2: frames — gate by key_frames row count
    const { count: framesCount } = await supabase
      .from("key_frames")
      .select("frame_index", { count: "exact", head: true })
      .eq("video_id", videoId);
    if (!framesCount) {
      const target = frameTargetCount(duration);
      const frames = await extractFrames(localMp4, tmp, duration, target);

      const uploaded = await Promise.all(
        frames.map(async (f) => {
          const storagePath = `frames/${videoId}/${String(f.idx).padStart(2, "0")}.jpg`;
          const jpgBuf = await fs.readFile(f.path);
          const { error: upErr } = await supabase.storage
            .from("videos")
            .upload(storagePath, jpgBuf, {
              contentType: "image/jpeg",
              upsert: true,
            });
          if (upErr)
            throw new Error(`frame upload failed (${storagePath}): ${upErr.message}`);
          return { idx: f.idx, t: f.t, storagePath };
        }),
      );

      const { error: kfErr } = await supabase.from("key_frames").insert(
        uploaded.map((u) => ({
          video_id: videoId,
          frame_index: u.idx,
          t_seconds: u.t,
          storage_path: u.storagePath,
        })),
      );
      if (kfErr) throw new Error(`key_frames insert failed: ${kfErr.message}`);

      await supabase
        .from("videos")
        .update({ status: "frames_extracted" })
        .eq("id", videoId);
    }

    // STEP 3: Claude breakdown — gate by breakdowns row existence. Reads
    // chunks + frames from DB/storage so this step works the same on a
    // fresh run as on a resume after STEP 2.
    const { data: breakdownRow } = await supabase
      .from("breakdowns")
      .select("video_id")
      .eq("video_id", videoId)
      .maybeSingle();
    if (!breakdownRow) {
      const [{ data: chunks }, { data: frames }] = await Promise.all([
        supabase
          .from("transcript_chunks")
          .select("text, t_start, t_end")
          .eq("video_id", videoId)
          .order("chunk_index", { ascending: true }),
        supabase
          .from("key_frames")
          .select("frame_index, t_seconds, storage_path")
          .eq("video_id", videoId)
          .order("frame_index", { ascending: true }),
      ]);
      if (!frames || frames.length === 0)
        throw new Error("STEP 3: no key_frames rows for video");

      const frameBase64 = await Promise.all(
        frames.map(async (f) => {
          const { data: jpgBlob, error: fdErr } = await supabase.storage
            .from("videos")
            .download(f.storage_path);
          if (fdErr || !jpgBlob)
            throw new Error(`frame download failed (${f.storage_path}): ${fdErr?.message}`);
          return Buffer.from(await jpgBlob.arrayBuffer()).toString("base64");
        }),
      );

      const transcriptLines = (chunks ?? []).map((c) => ({
        t_start: Number(c.t_start),
        t_end: Number(c.t_end),
        text: c.text as string,
      }));

      const anthropic = new Anthropic();
      const { parsed, raw } = await callClaudeBreakdown(anthropic, {
        metadata: {
          creator_handle: video.creator_handle,
          view_count: video.view_count,
          niche_tag: video.niche_tag,
          duration_seconds: duration,
        },
        transcriptLines,
        frames: frames.map((f, i) => ({
          t_seconds: Number(f.t_seconds),
          base64: frameBase64[i],
        })),
      });

      const { error: bErr } = await supabase.from("breakdowns").insert({
        video_id: videoId,
        hook: parsed.hook,
        problem: parsed.problem,
        twist: parsed.twist,
        solution: parsed.solution,
        cta: parsed.cta,
        tonality: parsed.tonality,
        authenticity_signals: parsed.authenticity_signals,
        pacing_notes: parsed.pacing_notes,
        buyer_psychology_levers: parsed.buyer_psychology_levers,
        visual_style_notes: parsed.visual_style_notes,
        male_creator_relevance: parsed.male_creator_relevance,
        raw_claude_response: raw as unknown as Record<string, unknown>,
        model: BREAKDOWN_MODEL,
      });
      if (bErr) throw new Error(`breakdown insert failed: ${bErr.message}`);
    }

    // Final: mark analyzed + clear any stale error_message. Safe to call even
    // when all steps were skipped — idempotent.
    await supabase
      .from("videos")
      .update({ status: "analyzed", error_message: null })
      .eq("id", videoId);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

// Pack Groq's verbose-json word stream into ~maxChars-sized lines with
// t_start/t_end. Used both to drive the Claude prompt and to populate
// transcript_chunks rows on first run.
function chunkByWordWindow(
  words: GroqWord[],
  maxChars: number,
): { t_start: number; t_end: number; text: string }[] {
  if (words.length === 0) return [];
  const out: { t_start: number; t_end: number; text: string }[] = [];
  let buf: GroqWord[] = [];
  let bufLen = 0;
  for (const w of words) {
    const next = bufLen + w.word.length + 1;
    if (next > maxChars && buf.length > 0) {
      out.push({
        t_start: buf[0].start,
        t_end: buf[buf.length - 1].end,
        text: buf.map((b) => b.word).join(" ").trim(),
      });
      buf = [];
      bufLen = 0;
    }
    buf.push(w);
    bufLen += w.word.length + 1;
  }
  if (buf.length > 0) {
    out.push({
      t_start: buf[0].start,
      t_end: buf[buf.length - 1].end,
      text: buf.map((b) => b.word).join(" ").trim(),
    });
  }
  return out;
}
