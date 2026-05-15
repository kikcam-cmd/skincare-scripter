// Iterate the pipeline without booting Next.
// Usage: node --env-file=.env.local --import tsx scripts/process-video.ts <videoId>

import { processVideo } from "../lib/pipeline/video";

async function main() {
  const videoId = process.argv[2];
  if (!videoId) {
    console.error("usage: process-video.ts <videoId>");
    process.exit(1);
  }
  console.log(`Running pipeline for ${videoId}…`);
  const t0 = Date.now();
  await processVideo({ videoId });
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
