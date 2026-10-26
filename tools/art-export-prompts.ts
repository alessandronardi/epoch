import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CardsArtFileSchema,
  CardsRulesFileSchema,
  CardsTextFileSchema,
} from '../data/schema/cards.schema.js';

export interface PendingPromptEntry {
  readonly id: string;
  readonly name: string;
  readonly era: number;
  readonly status: 'placeholder' | 'final' | 'missing';
  readonly prompt: string;
  readonly negative: string;
  readonly targetMasterPath: string;
}

export function getPendingPrompts(rootDir = process.cwd()): {
  total: number;
  finalCount: number;
  pendingCount: number;
  entries: PendingPromptEntry[];
} {
  const artJsonPath = path.join(rootDir, 'data', 'cards.art.json');
  const rulesJsonPath = path.join(rootDir, 'data', 'cards.rules.json');
  const textJsonPath = path.join(rootDir, 'data', 'cards.text.it.json');

  const artMap = CardsArtFileSchema.parse(
    JSON.parse(fs.readFileSync(artJsonPath, 'utf8')),
  );
  const rulesMap = CardsRulesFileSchema.parse(
    JSON.parse(fs.readFileSync(rulesJsonPath, 'utf8')),
  );
  const textMap = CardsTextFileSchema.parse(
    JSON.parse(fs.readFileSync(textJsonPath, 'utf8')),
  );

  const entries: PendingPromptEntry[] = [];
  let finalCount = 0;

  for (const id of Object.keys(rulesMap).sort()) {
    const art = artMap[id];
    const rules = rulesMap[id]!;
    const text = textMap[id];

    if (!art || !text) continue;

    if (art.status === 'final') {
      finalCount += 1;
    }

    if (art.status === 'placeholder' || art.status === 'missing') {
      entries.push({
        id,
        name: text.name,
        era: rules.era,
        status: art.status,
        prompt: art.prompt,
        negative: art.negative,
        targetMasterPath: `data/art/src/${id}.png`,
      });
    }
  }

  return {
    total: Object.keys(rulesMap).length,
    finalCount,
    pendingCount: entries.length,
    entries,
  };
}

function formatAsMarkdown(
  data: ReturnType<typeof getPendingPrompts>,
): string {
  let md = `# The Epochs — Prompt Illustrazioni Rimanenti (${data.pendingCount}/${data.total})\n\n`;
  md += `> **Stato attuale:** ${data.finalCount} carte definitive (\`status: "final"\`), ${data.pendingCount} carte con segnaposto (\`status: "placeholder"\`).\n\n`;
  md += `Quando le immagini sono pronte, salvale in \`data/art/incoming/{id}.png\` (o .jpg/.webp) ed esegui:\n\`\`\`bash\npnpm art:ingest --dir=data/art/incoming\npnpm art:build\n\`\`\`\n\n---\n\n`;

  for (const era of [1, 2, 3]) {
    const eraEntries = data.entries.filter((e) => e.era === era);
    if (eraEntries.length === 0) continue;

    md += `## Era ${era}\n\n`;
    for (const e of eraEntries) {
      md += `### \`${e.id}\` — **${e.name}**\n`;
      md += `- **Prompt:** \`${e.prompt}\`\n`;
      md += `- **Negative prompt:** \`${e.negative}\`\n`;
      md += `- **Destinazione master:** \`${e.targetMasterPath}\`\n\n`;
    }
  }

  return md;
}

function main(): void {
  const rootDir = process.cwd();
  const data = getPendingPrompts(rootDir);

  const outDir = path.join(rootDir, 'data', 'art');
  fs.mkdirSync(outDir, { recursive: true });

  const jsonOutPath = path.join(outDir, 'pending-prompts.json');
  fs.writeFileSync(jsonOutPath, JSON.stringify(data, null, 2), 'utf8');

  const mdOutPath = path.join(outDir, 'PENDING_PROMPTS.md');
  fs.writeFileSync(mdOutPath, formatAsMarkdown(data), 'utf8');

  console.log(`Report generato:`);
  console.log(`- Totale carte: ${data.total}`);
  console.log(`- Finali (master pronti): ${data.finalCount}`);
  console.log(`- Rimanenti: ${data.pendingCount}`);
  console.log(`- JSON salvato in: ${jsonOutPath}`);
  console.log(`- Markdown salvato in: ${mdOutPath}`);
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.basename(process.argv[1]) === 'art-export-prompts.ts';

if (isDirectRun) {
  main();
}
