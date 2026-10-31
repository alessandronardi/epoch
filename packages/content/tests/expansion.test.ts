import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getCatalog, generateRulesText } from '../src/index.js';
import { generateExpansionCatalog, checkExpansionFiles } from '../../../tools/expansion-catalog.js';
import { assertCatalogManifest } from '../../../tools/catalog-manifest.js';

describe('v2 content generation', () => {
  it('is reproducible and verifies all generated outputs and decks', () => {
    expect(() => checkExpansionFiles(true)).not.toThrow();
    const source = JSON.parse(fs.readFileSync('data/v2/catalog.source.json', 'utf8'));
    expect(generateExpansionCatalog(source)).toEqual(generateExpansionCatalog(source));
  });
  it('rejects a missing or additional card even when total is unchanged', () => {
    const catalog = { ...getCatalog('2.0').rulesById };
    catalog['unexpected'] = { ...catalog['n1_raider']!, id: 'unexpected' };
    delete catalog['n1_raider'];
    expect(() => assertCatalogManifest(catalog, '2.0')).toThrow();
  });
  it('keeps historic identities and effects in v1', () => {
    expect(getCatalog('1.0').cardsById['u3_arc_h']?.text.name).toBe('Archibugiere');
    expect(getCatalog('2.0').cardsById['u3_arc_h']).toBeUndefined();
    expect(getCatalog('1.0').rulesById['u3_inf_l']?.abilities).toEqual([]);
    expect(getCatalog('2.0').rulesById['u3_inf_l']?.abilities).toEqual([
      { kind: 'fury', amount: 2 },
    ]);
    expect(generateRulesText(getCatalog('2.0').rulesById['b2_archer']!)).toContain('Disciplina');
    expect(generateRulesText(getCatalog('2.0').rulesById['b2_archer']!)).toContain('Tiro');
  });
});
