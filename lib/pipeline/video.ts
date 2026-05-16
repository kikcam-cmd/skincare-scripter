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

type GroqWord = { word: string; start: number; end: number };
type GroqVerboseTranscription = {
  text: string;
  language?: string;
  words?: GroqWord[];
};

// Slice 2 pipeline: single-shot (no step gating yet — that's Slice 3), but now
// persists everything the pipeline produces: transcripts, transcript_chunks,
// key_frames rows + the JPGs in the `videos` bucket under `frames/{id}/`.
export async function processVideo({ videoId }: { videoId: string }): Promise<void> {
  const supabase = createAdminClient();

  const { data: video, error: vErr } = await supabase
    .from("videos")
    .select("id, storage_path, filename, creator_handle, view_count, niche_tag, duration_seconds")
    .eq("id", videoId)
    .single();
  if (vErr || !video) throw new Error(`video ${videoId} not found: ${vErr?.message}`);

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `scripter-${videoId}-`));
  const localMp4 = path.join(tmp, "in.mp4");

  try {
    // 1. download MP4 from storage
    const { data: blob, error: dErr } = await supabase.storage
      .from("videos")
      .download(video.storage_path);
    if (dErr || !blob) throw new Error(`download failed: ${dErr?.message}`);
    const buf = Buffer.from(await blob.arrayBuffer());
    await fs.writeFile(localMp4, buf);

    // 2. duration via ffmpeg probe
    const duration = video.duration_seconds ?? (await probeDuration(localMp4));
    if (!video.duration_seconds) {
      await supabase
        .from("videos")
        .update({ duration_seconds: duration })
        .eq("id", videoId);
    }

    // 3. audio extract + Groq Whisper
    const audioPath = path.join(tmp, "audio.mp3");
    await extractAudio(localMp4, audioPath);

    const groq = new Groq();
    const transcription = (await groq.audio.transcriptions.create({
      file: createReadStream(audioPath),
      model: "whisper-large-v3-turbo",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    })) as unknown as GroqVerboseTranscription;

    // 4. chunk transcript by word window — used both for Claude prompt and
    // as the row shape for `transcript_chunks`.
    const transcriptLines = chunkByWordWindow(transcription.words ?? [], 600);

    // 5. persist transcript + chunks. Supabase JS has no tx primitive, so this
    // is sequential. Slice 3 will add step gating; for now the retry route
    // deletes these rows before re-running.
    const { error: tErr } = await supabase.from("transcripts").insert({
      video_id: videoId,
      full_text: transcription.text,
      language: transcription.language ?? null,
      raw_groq_response: transcription as unknown as Record<string, unknown>,
    });
    if (tErr) throw new Error(`transcripts insert failed: ${tErr.message}`);

    if (transcriptLines.length > 0) {
      const { error: tcErr } = await supabase.from("transcript_chunks").insert(
        transcriptLines.map((line, idx) => ({
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

    // 6. frames — extract to /tmp, then in parallel upload JPGs to storage
    // and read base64 for the Claude vision call.
    const target = frameTargetCount(duration);
    const frames = await extractFrames(localMp4, tmp, duration, target);

    const frameUploads = frames.map(async (f) => {
      const storagePath = `frames/${videoId}/${String(f.idx).padStart(2, "0")}.jpg`;
      const buf = await fs.readFile(f.path);
      const { error: upErr } = await supabase.storage
        .from("videos")
        .upload(storagePath, buf, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (upErr) throw new Error(`frame upload failed (${storagePath}): ${upErr.message}`);
      return { idx: f.idx, t: f.t, storagePath, base64: buf.toString("base64") };
    });
    const uploaded = await Promise.all(frameUploads);
    const frameBase64 = uploaded.map((u) => u.base64);

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

    // 7. Claude breakdown
    const anthropic = new Anthropic();
    const { parsed, raw } = await callClaudeBreakdown(anthropic, {
      metadata: {
        creator_handle: video.creator_handle,
        view_count: video.view_count,
        niche_tag: video.niche_tag,
        duration_seconds: duration,
      },
      transcriptLines,
      frames: frames.map((f, i) => ({ t_seconds: f.t, base64: frameBase64[i] })),
    });

    // 8. persist breakdown
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

    await supabase
      .from("videos")
      .update({ status: "analyzed", error_message: null })
      .eq("id", videoId);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

// Slice 1 helper: pack Groq verbose-json word stream into ~maxChars-sized
// lines with t_start/t_end. Slice 2 promotes this to a `transcript_chunks` table.
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
