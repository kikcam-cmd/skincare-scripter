import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

// Streaming sha256: constant memory regardless of file size. Used as STEP 0
// of the pipeline to detect duplicate uploads against existing rows.
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
