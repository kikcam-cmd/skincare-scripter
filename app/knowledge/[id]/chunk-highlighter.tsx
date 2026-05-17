"use client";

import { useEffect } from "react";

// Deep-link target for /knowledge/[id]?chunk=N. On mount, scroll the matching
// chunk into view + flash a highlight class for 2s. Persistent state on a
// query param feels jarring on back-button, so the highlight fades.
export function ChunkHighlighter({ chunkIndex }: { chunkIndex: number }) {
  useEffect(() => {
    const el = document.getElementById(`chunk-${chunkIndex}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("bg-primary/10");
    const timer = window.setTimeout(() => {
      el.classList.remove("bg-primary/10");
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [chunkIndex]);
  return null;
}
