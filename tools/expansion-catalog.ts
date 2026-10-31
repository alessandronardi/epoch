import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  CardsRulesFileSchema,
  CardRulesSchema,
  CardTextSchema,
  CardArtSchema,
} from '../data/schema/cards.schema.js';
import { DeckPayloadSchema } from '../data/schema/deck.schema.js';
import { formatTypeLine, generateRulesText } from '../packages/content/src/index.js';
import { validateDeck } from '../packages/engine/src/deck.js';
import { assertCatalogManifest } from './catalog-manifest.js';

const EntrySchema = z
  .object({
    rules: CardRulesSchema,
    text: CardTextSchema,
    art: CardArtSchema,
    design: z
      .object({
        role: z.string().min(1),
        counterplay: z.string().min(1),
        artDirection: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export function generateExpansionCatalog(raw: unknown) {
  const source = z.record(EntrySchema).parse(raw);
  for (const [id, entry] of Object.entries(source)) {
    if (entry.rules.id !== id)
      throw new Error(`Card key ${id} differs from rules ID ${entry.rules.id}.`);
  }
  const rules = CardsRulesFileSchema.parse(
    Object.fromEntries(
      Object.entries(source)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, e]) => [id, e.rules]),
    ),
  );
  assertCatalogManifest(rules, '2.0');
  const text = Object.fromEntries(
    Object.entries(rules).map(([id, card]) => [
      id,
      { ...source[id]!.text, typeLine: formatTypeLine(card) },
    ]),
  );
  const art = Object.fromEntries(Object.keys(rules).map((id) => [id, source[id]!.art]));
  for (const card of Object.values(rules)) {
    if (card.affiliation === undefined) throw new Error(`Missing affiliation: ${card.id}`);
    if (!generateRulesText(card)) throw new Error(`Missing rules text: ${card.id}`);
  }
  return { rules, text, art };
}

export function checkExpansionFiles(check: boolean): void {
  const root = path.resolve('data/v2');
  const output = generateExpansionCatalog(
    JSON.parse(fs.readFileSync(path.join(root, 'catalog.source.json'), 'utf8')),
  );
  for (const [kind, data] of Object.entries(output)) {
    const file = path.join(root, kind === 'text' ? 'cards.text.it.json' : `cards.${kind}.json`);
    const serialized = JSON.stringify(data, null, 2) + '\n';
    if (check) {
      if (
        !fs.existsSync(file) ||
        fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== serialized
      )
        throw new Error(`${file} is out of sync with catalog.source.json.`);
    } else fs.writeFileSync(file, serialized);
  }
  const deckFiles = fs
    .readdirSync(path.join(root, 'decks'))
    .filter((f) => f.endsWith('.json'))
    .sort();
  const expectedDeckFiles = ['aggro-breach.json', 'balanced-tactical.json', 'boom-economy.json'];
  if (JSON.stringify(deckFiles) !== JSON.stringify(expectedDeckFiles))
    throw new Error('Expected exactly the three civilization deck files.');
  for (const file of deckFiles) {
    const deck = DeckPayloadSchema.parse(
      JSON.parse(fs.readFileSync(path.join(root, 'decks', file), 'utf8')),
    );
    const issues = validateDeck(deck, output.rules);
    if (issues.length) throw new Error(`${file}: ${JSON.stringify(issues)}`);
  }
  console.log('OK: v2 manifest, 62 cards and three 60-card civilization decks.');
}
