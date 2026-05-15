"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Phase = "idle" | "signing" | "uploading" | "registering" | "done" | "error";

export function UploadCard() {
  const router = useRouter();
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
          }),
        });
        if (!regRes.ok) throw new Error(`register failed: ${await regRes.text()}`);
        const { videoId } = (await regRes.json()) as { videoId: string };

        setPhase("done");
        router.push(`/videos/${videoId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    },
    [router],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "video/mp4": [".mp4"],
      "video/quicktime": [".mov"],
      "video/webm": [".webm"],
    },
    multiple: false,
    disabled: phase !== "idle" && phase !== "error" && phase !== "done",
  });

  return (
    <Card>
      <CardContent className="p-0">
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-10 text-center cursor-pointer
            transition-colors
            ${isDragActive ? "border-primary bg-muted/50" : "border-border hover:bg-muted/30"}
            ${phase === "uploading" || phase === "signing" || phase === "registering" ? "pointer-events-none opacity-60" : ""}
          `}
        >
          <input {...getInputProps()} />
          {phase === "idle" || phase === "done" || phase === "error" ? (
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
          <p className="px-6 pb-4 text-xs text-destructive font-mono whitespace-pre-wrap">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
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
