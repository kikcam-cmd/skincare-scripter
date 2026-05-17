// Iterate the knowledge pipeline without booting Next.
// Usage: npm run process-knowledge <knowledge-item-uuid>

import { processKnowledge } from "../lib/pipeline/knowledge";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("usage: process-knowledge.ts <knowledgeItemId>");
    process.exit(1);
  }
  console.log(`Running knowledge pipeline for ${id}…`);
  const t0 = Date.now();
  await processKnowledge({ knowledgeItemId: id });
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
