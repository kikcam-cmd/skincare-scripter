"use client";

import { useEffect, useRef, useState } from "react";

type Chunk = { id: string; chunk_index: number; text: string; t_start: number; t_end: number };
type Frame = { frame_index: number; t_seconds: number; signed_url: string };

export function StudyTool({
  videoUrl,
  chunks,
  frames,
  initialT,
}: {
  videoUrl: string;
  chunks: Chunk[];
  frames: Frame[];
  initialT?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // Deep-link seek: when /videos/[id]?t=N lands, jump to that moment as soon
  // as metadata is loadable. If the video element was cached and metadata
  // already arrived before this effect attached, seek immediately; otherwise
  // wait for the one-shot loadedmetadata event.
  useEffect(() => {
    if (initialT === undefined || initialT === null) return;
    const el = videoRef.current;
    if (!el) return;
    const apply = () => {
      el.currentTime = initialT;
      void el.play().catch(() => undefined);
    };
    if (el.readyState >= 1) {
      apply();
      return;
    }
    const once = () => {
      apply();
      el.removeEventListener("loadedmetadata", once);
    };
    el.addEventListener("loadedmetadata", once);
    return () => el.removeEventListener("loadedmetadata", once);
  }, [initialT]);

  const seek = (t: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = t;
    void el.play();
  };

  return (
    <div className="space-y-4">
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        preload="metadata"
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        className="w-full rounded-lg bg-black aspect-[9/16] max-h-[70vh] mx-auto"
      />

      {frames.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {frames.map((f) => {
            const isActive =
              currentTime >= f.t_seconds &&
              (frames[f.frame_index + 1]?.t_seconds ?? Infinity) > currentTime;
            return (
              <button
                key={f.frame_index}
                type="button"
                onClick={() => seek(f.t_seconds)}
                className={`shrink-0 rounded border transition ${
                  isActive ? "border-primary ring-2 ring-primary/50" : "border-border hover:border-foreground/40"
                }`}
                title={`${f.t_seconds.toFixed(1)}s`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.signed_url}
                  alt={`frame ${f.frame_index} at ${f.t_seconds.toFixed(1)}s`}
                  className="h-20 w-auto rounded-sm"
                />
                <div className="text-[10px] font-mono text-muted-foreground text-center py-0.5">
                  {formatTimestamp(f.t_seconds)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {chunks.length > 0 && (
        <div className="space-y-1 max-h-96 overflow-y-auto rounded border p-3 text-sm leading-relaxed">
          {chunks.map((c) => {
            const isActive = currentTime >= c.t_start && currentTime < c.t_end;
            return (
              <p
                key={c.id}
                className={`flex gap-3 ${isActive ? "bg-primary/10 -mx-1 px-1 rounded" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => seek(c.t_start)}
                  className="shrink-0 font-mono text-xs text-muted-foreground hover:text-foreground tabular-nums w-12 text-right pt-0.5"
                >
                  {formatTimestamp(c.t_start)}
                </button>
                <span>{c.text}</span>
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTimestamp(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
