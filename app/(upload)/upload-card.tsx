"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Phase = "idle" | "signing" | "uploading" | "registering" | "done" | "error";
type Gender = "unknown" | "male" | "female";

export function UploadCard() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [creatorGender, setCreatorGender] = useState<Gender>("unknown");
  const [brand, setBrand] = useState("");
  const [productName, setProductName] = useState("");
  const [userNotes, setUserNotes] = useState("");

  const resetMetadata = () => {
    setCreatorGender("unknown");
    setBrand("");
    setProductName("");
    setUserNotes("");
  };

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setError(null);
      setProgress(0);

      try {
        setPhase("signing");
        const signRes = await fetch("/api/uploads/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: file.type }),
        });
        if (!signRes.ok) throw new Error(`sign failed: ${await signRes.text()}`);
        const { signedUrl, storagePath } = (await signRes.json()) as {
          signedUrl: string;
          storagePath: string;
        };

        setPhase("uploading");
        await putWithProgress(signedUrl, file, setProgress);

        setPhase("registering");
        const regRes = await fetch("/api/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storagePath,
            filename: file.name,
            creatorGender,
            brand: brand.trim() || null,
            productName: productName.trim() || null,
            userNotes: userNotes.trim() || null,
          }),
        });
        if (!regRes.ok) throw new Error(`register failed: ${await regRes.text()}`);
        const { videoId } = (await regRes.json()) as { videoId: string };

        resetMetadata();
        setPhase("done");
        router.push(`/videos/${videoId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    },
    [router, creatorGender, brand, productName, userNotes],
  );

  const busy = phase === "signing" || phase === "uploading" || phase === "registering";

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "video/mp4": [".mp4"],
      "video/quicktime": [".mov"],
      "video/webm": [".webm"],
    },
    multiple: false,
    disabled: busy,
  });

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand">
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Dr. Melaxin"
              disabled={busy}
              className="w-full h-9 px-3 rounded-md border bg-background text-sm"
            />
          </Field>
          <Field label="Product">
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Lip Plumper"
              disabled={busy}
              className="w-full h-9 px-3 rounded-md border bg-background text-sm"
            />
          </Field>
        </div>

        <Field label="Creator gender">
          <div className="flex gap-2">
            {(["unknown", "male", "female"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setCreatorGender(g)}
                disabled={busy}
                className={`
                  h-9 px-4 rounded-md border text-sm capitalize
                  ${creatorGender === g
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted"}
                `}
              >
                {g}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Notes (optional)">
          <textarea
            value={userNotes}
            onChange={(e) => setUserNotes(e.target.value)}
            placeholder="What caught your eye, keywords, context for future you…"
            disabled={busy}
            rows={2}
            className="w-full px-3 py-2 rounded-md border bg-background text-sm resize-y"
          />
        </Field>

        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-10 text-center cursor-pointer
            transition-colors
            ${isDragActive ? "border-primary bg-muted/50" : "border-border hover:bg-muted/30"}
            ${busy ? "pointer-events-none opacity-60" : ""}
          `}
        >
          <input {...getInputProps()} />
          {!busy ? (
            <div className="space-y-2">
              <p className="text-sm">
                {isDragActive ? "Drop it." : "Drop an MP4 here, or click to pick."}
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
                  style={{ width: `${phase === "uploading" ? progress : phase === "registering" ? 100 : 5}%` }}
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
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
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
