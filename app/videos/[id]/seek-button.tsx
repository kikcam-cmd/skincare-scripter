"use client";

// Tiny client island so the server-rendered BreakdownSummary can have
// clickable timestamps without lifting itself into a client component.
// Clicking dispatches a window-level CustomEvent that StudyTool listens for.
// Same-page-only by design — refresh resets, no global state to manage.

export const SEEK_EVENT = "skincare-scripter:seek-video";

export function SeekButton({
  t,
  children,
  className,
}: {
  t: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent(SEEK_EVENT, { detail: { t } }),
        )
      }
      className={
        className ??
        "font-mono text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground transition"
      }
    >
      {children}
    </button>
  );
}
