import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

// ffmpeg-static exports a path computed from __dirname which Turbopack rewrites
// in dev — the resulting path points into .next/ where no binary exists.
// Fall back to a process.cwd()-relative path, which is correct both in `next dev`
// and on Vercel (where outputFileTracingIncludes ships the binary).
function resolveFfmpeg(): string {
  const fromPkg = ffmpegStatic as unknown as string | null;
  if (fromPkg && existsSync(fromPkg)) return fromPkg;
  const fromCwd = path.join(process.cwd(), "node_modules/ffmpeg-static/ffmpeg");
  if (existsSync(fromCwd)) return fromCwd;
  return "ffmpeg";
}
const FFMPEG = resolveFfmpeg();

export function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", (err) =>
      reject(new Error(`ffmpeg spawn failed (path=${FFMPEG}): ${err.message}`)),
    );
    proc.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg exited ${code} (path=${FFMPEG}): ${stderr.slice(-2000)}`));
    });
  });
}

// Parses "Duration: HH:MM:SS.ms" out of ffmpeg's stderr from a probe invocation.
// We deliberately use `-t 0` + null muxer so ffmpeg prints header info (including
// Duration) and exits immediately — much faster than letting it run the encode.
export async function probeDuration(input: string): Promise<number> {
  let stderr = "";
  let spawnErr: Error | null = null;
  await new Promise<void>((resolve) => {
    const proc = spawn(FFMPEG, ["-hide_banner", "-i", input, "-t", "0", "-f", "null", "-"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", () => resolve());
    proc.on("error", (err) => {
      spawnErr = err;
      resolve();
    });
  });
  if (spawnErr) {
    throw new Error(`ffmpeg probe spawn failed (path=${FFMPEG}): ${(spawnErr as Error).message}`);
  }
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (!m) {
    throw new Error(
      `could not parse duration (path=${FFMPEG}, stderr_len=${stderr.length}):\n${stderr.slice(-1500)}`,
    );
  }
  const [, h, mm, s] = m;
  return parseInt(h, 10) * 3600 + parseInt(mm, 10) * 60 + parseFloat(s);
}

export async function extractAudio(input: string, output: string): Promise<void> {
  await runFfmpeg([
    "-y",
    "-i", input,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-b:a", "64k",
    "-f", "mp3",
    output,
  ]);
}

export type Frame = { idx: number; t: number; path: string };

// Slice 1: evenly-spaced via -ss seek per frame. Hybrid scene-detect (PLAN §4)
// arrives in Slice 2 when we start persisting frames.
export async function extractFrames(
  input: string,
  outDir: string,
  duration: number,
  target: number,
): Promise<Frame[]> {
  const frames: Frame[] = [];
  for (let i = 0; i < target; i++) {
    // Center each frame in its time bucket so we avoid t=0 (often a hard cut/black frame)
    // and t=duration (often a trailing transition).
    const t = ((i + 0.5) / target) * duration;
    const path = `${outDir}/frame_${String(i).padStart(2, "0")}.jpg`;
    await runFfmpeg([
      "-y",
      "-ss", t.toFixed(3),
      "-i", input,
      "-frames:v", "1",
      "-vf", "scale=768:-1",
      "-q:v", "3",
      path,
    ]);
    frames.push({ idx: i, t, path });
  }
  return frames;
}

export function frameTargetCount(duration: number): number {
  if (duration <= 30) return 10;
  if (duration <= 60) return 15;
  if (duration <= 120) return 20;
  return Math.min(25, Math.ceil(duration / 6));
}
