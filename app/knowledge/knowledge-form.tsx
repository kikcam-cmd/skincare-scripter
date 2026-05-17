"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Tab = "file" | "paste";
type Phase = "idle" | "signing" | "uploading" | "registering" | "error";
type Kind = "pdf" | "md" | "txt";

const ACCEPT: Record<Kind, Record<string, string[]>> = {
  pdf: { "application/pdf": [".pdf"] },
  md: { "text/markdown": [".md", ".markdown"], "text/plain": [".md"] },
  txt: { "text/plain": [".txt"] },
};

export function KnowledgeForm() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("file");
  const [title, setTitle] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");

  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="flex gap-2">
          {(["file", "paste"] as Tab[]).map((t) => (
            <Button
              key={t}
              type="button"
              variant={tab === t ? "default" : "outline"}
              size="sm"
              onClick={() => setTab(t)}
            >
              {t === "file" ? "Upload file" : "Paste text"}
            </Button>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              placeholder="e.g. $100M Offers"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="source">Source label (optional)</Label>
            <Input
              id="source"
              placeholder="e.g. Hormozi - $100M Offers"
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
            />
          </div>
        </div>

        {tab === "file" ? (
          <FileUpload
            title={title}
            sourceLabel={sourceLabel}
            onDone={(id) => router.push(`/knowledge/${id}`)}
          />
        ) : (
          <PasteForm
            title={title}
            sourceLabel={sourceLabel}
            onDone={(id) => router.push(`/knowledge/${id}`)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function FileUpload({
  title,
  sourceLabel,
  onDone,
}: {
  title: string;
  sourceLabel: string;
  onDone: (id: string) => void;
}) {
  const [kind, setKind] = useState<Kind>("pdf");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setError(null);
      setProgress(0);

      try {
        setPhase("signing");
        const signRes = await fetch("/api/uploads/sign-knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, kind }),
        });
        if (!signRes.ok) throw new Error(`sign failed: ${await signRes.text()}`);
        const { signedUrl, storagePath } = (await signRes.json()) as {
          signedUrl: string;
          storagePath: string;
        };

        setPhase("uploading");
        await putWithProgress(signedUrl, file, setProgress);

        setPhase("registering");
        const regRes = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            storagePath,
            filename: file.name,
            title: title.trim() || undefined,
            sourceLabel: sourceLabel.trim() || undefined,
          }),
        });
        if (!regRes.ok) throw new Error(`register failed: ${await regRes.text()}`);
        const { knowledgeItemId } = (await regRes.json()) as {
          knowledgeItemId: string;
        };
        onDone(knowledgeItemId);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    },
    [kind, title, sourceLabel, onDone],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT[kind],
    multiple: false,
    disabled: phase === "signing" || phase === "uploading" || phase === "registering",
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-xs">
        {(["pdf", "md", "txt"] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`px-2 py-1 rounded font-mono uppercase ${
              kind === k
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-primary bg-muted/50" : "border-border hover:bg-muted/30"
        } ${
          phase === "signing" || phase === "uploading" || phase === "registering"
            ? "pointer-events-none opacity-60"
            : ""
        }`}
      >
        <input {...getInputProps()} />
        {phase === "idle" || phase === "error" ? (
          <div className="space-y-2">
            <p className="text-sm">
              {isDragActive
                ? "Drop it."
                : `Drop a ${kind.toUpperCase()} here, or click to pick.`}
            </p>
            <Button type="button" variant="secondary" size="sm">
              Choose file
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-mono">
              {phase === "signing" && "Getting upload URL…"}
              {phase === "uploading" && `Uploading… ${progress}%`}
              {phase === "registering" && "Registering with pipeline…"}
            </p>
            <div className="h-1 bg-muted rounded overflow-hidden max-w-xs mx-auto">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${phase === "uploading" ? progress : phase === "registering" ? 100 : 5}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs text-destructive font-mono whitespace-pre-wrap">
          {error}
        </p>
      )}
    </div>
  );
}

function PasteForm({
  title,
  sourceLabel,
  onDone,
}: {
  title: string;
  sourceLabel: string;
  onDone: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!text.trim()) {
      setError("Paste some text first.");
      setPhase("error");
      return;
    }
    setError(null);
    setPhase("submitting");
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "pasted",
          pastedText: text,
          title: title.trim() || undefined,
          sourceLabel: sourceLabel.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`register failed: ${await res.text()}`);
      const { knowledgeItemId } = (await res.json()) as { knowledgeItemId: string };
      onDone(knowledgeItemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a snippet of writing, transcript, or notes…"
        rows={8}
        className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-mono outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        disabled={phase === "submitting"}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground font-mono">
          {text.length.toLocaleString()} chars
        </span>
        <Button type="button" onClick={submit} disabled={phase === "submitting"}>
          {phase === "submitting" ? "Adding…" : "Add to corpus"}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive font-mono whitespace-pre-wrap">
          {error}
        </p>
      )}
    </div>
  );
}

function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload status ${xhr.status}: ${xhr.responseText}`));
    };
    xhr.onerror = () => reject(new Error("upload network error"));
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.send(file);
  });
}
