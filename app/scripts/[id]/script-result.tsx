import Link from "next/link";

export type ChunkMeta = {
  id: string;
  kind: string;
  text: string;
  source: string;
  videoId: string | null;
  knowledgeItemId: string | null;
};

type Props = {
  kind: string;
  output: Record<string, unknown>;
  chunkMeta: Map<string, ChunkMeta>;
  retrievedCount: number;
};

export function ScriptResult({ kind, output, chunkMeta, retrievedCount }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Grounded in {retrievedCount} corpus chunks · output_kind:{" "}
        <span className="font-mono">{kind}</span>
      </p>
      {kind === "hook_ideas" && (
        <HookIdeasResult output={output} chunkMeta={chunkMeta} />
      )}
      {kind === "full_script" && (
        <FullScriptResult output={output} chunkMeta={chunkMeta} />
      )}
      {kind === "demo_angle" && (
        <DemoAngleResult output={output} chunkMeta={chunkMeta} />
      )}
      {kind === "freeform" && (
        <FreeformResult output={output} chunkMeta={chunkMeta} />
      )}
    </div>
  );
}

function Citations({
  ids,
  chunkMeta,
}: {
  ids: string[];
  chunkMeta: Map<string, ChunkMeta>;
}) {
  if (!ids || ids.length === 0) {
    return (
      <p className="text-xs text-amber-700 italic">
        [no grounding — creator input needed]
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => {
        const meta = chunkMeta.get(id);
        if (!meta) {
          return (
            <span
              key={id}
              className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
            >
              {id.slice(0, 8)}
            </span>
          );
        }
        const href = meta.videoId
          ? `/videos/${meta.videoId}`
          : meta.knowledgeItemId
            ? `/knowledge/${meta.knowledgeItemId}`
            : null;
        const inner = (
          <span
            title={meta.text.slice(0, 280)}
            className="text-xs px-1.5 py-0.5 rounded bg-muted hover:bg-muted/70 cursor-help"
          >
            {meta.source} · {meta.kind}
          </span>
        );
        return href ? (
          <Link key={id} href={href} target="_blank" rel="noopener">
            {inner}
          </Link>
        ) : (
          <span key={id}>{inner}</span>
        );
      })}
    </div>
  );
}

// ── hook_ideas ────────────────────────────────────────────────────────────

type Hook = {
  text: string;
  tactic: string;
  why_it_works: string;
  cited_chunk_ids: string[];
};

function HookIdeasResult({
  output,
  chunkMeta,
}: {
  output: Record<string, unknown>;
  chunkMeta: Map<string, ChunkMeta>;
}) {
  const hooks = (output.hooks as Hook[] | undefined) ?? [];
  const tonality = output.tonality_direction as string | undefined;
  const notes = output.notes as string | null | undefined;
  return (
    <div className="space-y-4">
      <SectionHeading>Hook ideas</SectionHeading>
      <ul className="space-y-3">
        {hooks.map((h, i) => (
          <li key={i} className="rounded border p-4 space-y-2">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-base leading-relaxed">{h.text}</p>
              <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                {h.tactic}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{h.why_it_works}</p>
            <Citations ids={h.cited_chunk_ids ?? []} chunkMeta={chunkMeta} />
          </li>
        ))}
      </ul>
      {tonality && (
        <Card label="Tonality direction" body={tonality} />
      )}
      {notes && (
        <p className="text-xs text-muted-foreground italic">{notes}</p>
      )}
    </div>
  );
}

// ── full_script ───────────────────────────────────────────────────────────

type Beat = {
  text: string;
  tactic?: string;
  framing?: string;
  style?: string;
  cited_chunk_ids: string[];
};

function FullScriptResult({
  output,
  chunkMeta,
}: {
  output: Record<string, unknown>;
  chunkMeta: Map<string, ChunkMeta>;
}) {
  const beats: Array<[string, Beat | undefined]> = [
    ["Hook", output.hook as Beat | undefined],
    ["Problem", output.problem as Beat | undefined],
    ["Twist", output.twist as Beat | undefined],
    ["Solution", output.solution as Beat | undefined],
    ["CTA", output.cta as Beat | undefined],
  ];
  const tonality = output.tonality as string | undefined;
  const pacing = output.pacing_notes as string | undefined;
  const visual = output.visual_direction as string | undefined;
  const auth = (output.authenticity_signals_to_use as string[] | undefined) ?? [];
  const notes = output.notes as string | null | undefined;

  return (
    <div className="space-y-4">
      <SectionHeading>Full script</SectionHeading>
      {beats.map(([label, b]) => {
        if (!b) return null;
        const meta = b.tactic ?? b.framing ?? b.style ?? "";
        return (
          <div key={label} className="rounded border p-4 space-y-2">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </h3>
              {meta && (
                <span className="text-xs text-muted-foreground font-mono">
                  {meta}
                </span>
              )}
            </div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {b.text}
            </p>
            <Citations ids={b.cited_chunk_ids ?? []} chunkMeta={chunkMeta} />
          </div>
        );
      })}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {tonality && <Card label="Tonality" body={tonality} />}
        {pacing && <Card label="Pacing" body={pacing} />}
        {visual && <Card label="Visual direction" body={visual} />}
      </div>
      {auth.length > 0 && (
        <div className="rounded border p-4 space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Authenticity signals to use
          </h3>
          <ul className="list-disc list-inside text-sm space-y-0.5">
            {auth.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {notes && <p className="text-xs text-muted-foreground italic">{notes}</p>}
    </div>
  );
}

// ── demo_angle ────────────────────────────────────────────────────────────

type DemoBeat = {
  beat: string;
  t_marker: string | null;
  cited_chunk_ids: string[];
};

function DemoAngleResult({
  output,
  chunkMeta,
}: {
  output: Record<string, unknown>;
  chunkMeta: Map<string, ChunkMeta>;
}) {
  const visualSetup = output.visual_setup as string | undefined;
  const beats = (output.demo_beats as DemoBeat[] | undefined) ?? [];
  const proof = (output.proof_moments as string[] | undefined) ?? [];
  const onScreen = (output.on_screen_text_suggestions as string[] | undefined) ?? [];
  const voDirection = output.voiceover_direction as string | undefined;
  const cited = (output.cited_chunk_ids as string[] | undefined) ?? [];

  return (
    <div className="space-y-4">
      <SectionHeading>Demo angle</SectionHeading>
      {visualSetup && <Card label="Visual setup" body={visualSetup} />}
      {beats.length > 0 && (
        <div className="rounded border p-4 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Demo beats
          </h3>
          <ol className="space-y-3">
            {beats.map((b, i) => (
              <li key={i} className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                    {b.t_marker ?? `#${i + 1}`}
                  </span>
                  <p className="text-sm">{b.beat}</p>
                </div>
                <Citations
                  ids={b.cited_chunk_ids ?? []}
                  chunkMeta={chunkMeta}
                />
              </li>
            ))}
          </ol>
        </div>
      )}
      {proof.length > 0 && (
        <div className="rounded border p-4 space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Proof moments
          </h3>
          <ul className="list-disc list-inside text-sm space-y-0.5">
            {proof.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {onScreen.length > 0 && (
        <div className="rounded border p-4 space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            On-screen text
          </h3>
          <ul className="list-disc list-inside text-sm space-y-0.5">
            {onScreen.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {voDirection && (
        <div className="rounded border p-4 space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Voiceover direction
          </h3>
          <p className="text-sm">{voDirection}</p>
          <Citations ids={cited} chunkMeta={chunkMeta} />
        </div>
      )}
    </div>
  );
}

// ── freeform ──────────────────────────────────────────────────────────────

type FreeformSection = {
  heading: string | null;
  body: string;
  cited_chunk_ids: string[];
};

function FreeformResult({
  output,
  chunkMeta,
}: {
  output: Record<string, unknown>;
  chunkMeta: Map<string, ChunkMeta>;
}) {
  const shapeNote = output.shape_note as string | undefined;
  const sections = (output.sections as FreeformSection[] | undefined) ?? [];
  return (
    <div className="space-y-4">
      <SectionHeading>Freeform</SectionHeading>
      {shapeNote && (
        <p className="text-xs text-muted-foreground italic">
          Shape choice: {shapeNote}
        </p>
      )}
      {sections.map((s, i) => (
        <div key={i} className="rounded border p-4 space-y-2">
          {s.heading && <h3 className="text-sm font-medium">{s.heading}</h3>}
          <p className="text-sm whitespace-pre-wrap leading-relaxed">
            {s.body}
          </p>
          <Citations
            ids={s.cited_chunk_ids ?? []}
            chunkMeta={chunkMeta}
          />
        </div>
      ))}
    </div>
  );
}

// ── shared ────────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  );
}

function Card({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded border p-3 space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{body}</p>
    </div>
  );
}
