import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractGddExpectations,
  normalizeGddEffectTextToRulesText,
  validateContentCatalog,
} from '../../../tools/content-validate.js';
import {
  buildCardCatalog,
  CARD_CATALOG,
  CARDS_ART,
  CARDS_RULES,
  CARDS_TEXT_IT,
  computeArcherMeleeAtk,
  formatTypeLine,
  generateRulesText,
  getCard,
  getCardKeywords,
  getKeywordTooltip,
  KEYWORD_TOOLTIPS_IT,
  loadCardCatalog,
  type CardRules,
  type KeywordName,
} from '../src/index.js';

const ROOT_DIR = process.cwd();
const GDD_MARKDOWN = fs.readFileSync(
  path.join(ROOT_DIR, 'docs', 'GDD.md'),
  'utf8',
);

describe('@epochs/content catalog loader & helpers', () => {
  it('loads all 45 official cards (15 per Era) with rules, text, and art', () => {
    const catalog = loadCardCatalog('it');
    expect(catalog).toBe(CARD_CATALOG);
    expect(catalog.allCards).toHaveLength(45);
    expect(Object.keys(CARDS_RULES)).toHaveLength(45);
    expect(Object.keys(CARDS_TEXT_IT)).toHaveLength(45);
    expect(Object.keys(CARDS_ART)).toHaveLength(45);

    const era1 = catalog.allCards.filter((c) => c.rules.era === 1);
    const era2 = catalog.allCards.filter((c) => c.rules.era === 2);
    const era3 = catalog.allCards.filter((c) => c.rules.era === 3);
    expect(era1).toHaveLength(15);
    expect(era2).toHaveLength(15);
    expect(era3).toHaveLength(15);

    // Check e3_gld and e3_frn are conversions (not economy)
    expect(getCard('e3_gld').rules.type).toBe('conversion');
    expect(getCard('e3_frn').rules.type).toBe('conversion');
  });

  it('throws on unknown cardId in getCard', () => {
    expect(() => getCard('non_existent_card')).toThrow(/Unknown cardId/);
  });

  it('computes archer melee ATK as max(1, floor(atk / 2)) matching GDD values (1, 1, 2, 2, 3, 4)', () => {
    const archerExpectations: ReadonlyArray<[string, number, number]> = [
      ['u1_arc_l', 2, 1],
      ['u1_arc_h', 3, 1],
      ['u2_arc_l', 4, 2],
      ['u2_arc_h', 5, 2],
      ['u3_arc_l', 6, 3],
      ['u3_arc_h', 8, 4],
    ];

    for (const [id, expectedAtk, expectedMelee] of archerExpectations) {
      const card = getCard(id);
      expect(card.rules.atk).toBe(expectedAtk);
      expect(computeArcherMeleeAtk(card.rules.atk!)).toBe(expectedMelee);
      expect(card.rulesText).toContain(`Mischia: ${expectedMelee} ATK.`);
    }
    expect(computeArcherMeleeAtk(1)).toBe(1);
  });

  it('generates exact rules text for all 10 templates in §8.3', () => {
    expect(generateRulesText(getCard('e1_farm').rules, 'it')).toBe(
      'Produzione: +1 Cibo.',
    );
    expect(generateRulesText(getCard('e2_fnd').rules, 'it')).toBe(
      'Produzione: +2 Metallo.',
    );
    expect(generateRulesText(getCard('u1_inf_l').rules, 'it')).toBe(
      'Unità combattente.',
    );
    expect(generateRulesText(getCard('u2_spr_h').rules, 'it')).toBe(
      'Impalamento: 5 danni vs Cavalleria.',
    );
    expect(generateRulesText(getCard('u3_arc_h').rules, 'it')).toBe(
      'Tiro (+3 vs Lancieri); Mischia: 4 ATK.',
    );
    expect(generateRulesText(getCard('u2_cav_h').rules, 'it')).toBe(
      'Accerchiamento (+2 ATK vs Arcieri).',
    );
    expect(generateRulesText(getCard('u1_sig_h').rules, 'it')).toBe(
      'Non combattente; solo Demolizione.',
    );
    expect(generateRulesText(getCard('i1_arr').rules, 'it')).toBe(
      'Pre-Battaglia (0 Slot): +2 ATK ai tuoi Arcieri.',
    );
    expect(generateRulesText(getCard('i2_mor').rules, 'it')).toBe(
      'Pre-Battaglia (0 Slot): +2 ATK alle tue unità sul Fronte.',
    );
    expect(generateRulesText(getCard('i1_wall').rules, 'it')).toBe(
      'Pre-Battaglia (0 Slot): +3 HP alle tue Mura.',
    );
    expect(generateRulesText(getCard('i2_sab').rules, 'it')).toBe(
      'Pre-Battaglia (0 Slot): -4 HP alle Mura nemiche.',
    );
    expect(generateRulesText(getCard('e3_gld').rules, 'it')).toBe(
      '0 Slot. Sacrifica 1 tuo Edificio: +1 Cibo, +1 Legno, +1 Metallo per tuo edificio pre-sacrificio.',
    );
    expect(generateRulesText(getCard('e3_frn').rules, 'it')).toBe(
      '0 Slot. Sacrifica 1 tuo Edificio: +2 Legno, +3 Metallo e +1 DEM alle tue unità in Era III.',
    );
  });

  it('handles defensive error branches in formatTypeLine and generateRulesText', () => {
    const brokenUnit = {
      id: 'broken_unit',
      era: 1,
      type: 'unit',
      cost: { food: 1, wood: 0, metal: 0 },
      abilities: [],
    } as unknown as CardRules;
    expect(() => formatTypeLine(brokenUnit, 'it')).toThrow(
      /missing category or line/,
    );

    const brokenEconomy = {
      id: 'broken_eco',
      era: 1,
      type: 'economy',
      cost: { food: 1, wood: 0, metal: 0 },
      abilities: [],
    } as unknown as CardRules;
    expect(() => generateRulesText(brokenEconomy, 'it')).toThrow(
      /missing production/,
    );

    const brokenInstant = {
      id: 'broken_inst',
      era: 1,
      type: 'instant',
      cost: { food: 1, wood: 0, metal: 0 },
      abilities: [],
    } as unknown as CardRules;
    expect(() => generateRulesText(brokenInstant, 'it')).toThrow(
      /missing or invalid InstantEffect/,
    );

    const brokenConversion = {
      id: 'broken_conv',
      era: 3,
      type: 'conversion',
      cost: { food: 1, wood: 0, metal: 0 },
      abilities: [],
    } as unknown as CardRules;
    expect(() => generateRulesText(brokenConversion, 'it')).toThrow(
      /missing or invalid ConversionEffect/,
    );
  });

  it('provides all 6 keyword tooltips and extracts card keywords accurately', () => {
    const allKeywords: KeywordName[] = [
      'Tiro',
      'Impalamento',
      'Accerchiamento',
      'Demolizione (DEM)',
      'Riconversione',
      'Istantanea',
    ];
    for (const kw of allKeywords) {
      expect(getKeywordTooltip(kw, 'it')).toBe(KEYWORD_TOOLTIPS_IT[kw]);
      expect(getKeywordTooltip(kw).length).toBeGreaterThan(30);
    }

    expect(getCardKeywords(getCard('u1_arc_l').rules)).toEqual(['Tiro']);
    expect(getCardKeywords(getCard('u3_arc_h').rules)).toEqual([
      'Tiro',
      'Demolizione (DEM)',
    ]);
    expect(getCardKeywords(getCard('u1_spr_l').rules)).toEqual(['Impalamento']);
    expect(getCardKeywords(getCard('u2_cav_h').rules)).toEqual([
      'Accerchiamento',
      'Demolizione (DEM)',
    ]);
    expect(getCardKeywords(getCard('u1_sig_h').rules)).toEqual([
      'Demolizione (DEM)',
    ]);
    expect(getCardKeywords(getCard('e3_gld').rules)).toEqual(['Riconversione']);
    expect(getCardKeywords(getCard('e3_frn').rules)).toEqual([
      'Demolizione (DEM)',
      'Riconversione',
    ]);
    expect(getCardKeywords(getCard('i1_arr').rules)).toEqual(['Istantanea']);
  });
});

describe('tools/content-validate.ts validation suite', () => {
  it('validates the official 45-card catalog with 0 errors', () => {
    const res = validateContentCatalog({
      rawRules: CARDS_RULES,
      rawText: CARDS_TEXT_IT,
      rawArt: CARDS_ART,
      gddMarkdown: GDD_MARKDOWN,
    });
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it('normalizes GDD effect text and extracts all 45 rows from GDD §7', () => {
    expect(
      normalizeGddEffectTextToRulesText(
        '0 Slot. Sacrifica 1 tuo Edificio: +1 🍖, +1 🪵, +1 ⛏️ per tuo edificio pre-sacrificio',
      ),
    ).toBe(
      '0 Slot. Sacrifica 1 tuo Edificio: +1 Cibo, +1 Legno, +1 Metallo per tuo edificio pre-sacrificio.',
    );
    const expectations = extractGddExpectations(GDD_MARKDOWN);
    expect(Object.keys(expectations)).toHaveLength(45);
  });

  it('detects missing or mismatched card IDs and invalid card counts', () => {
    const fewerRules = { ...CARDS_RULES };
    delete fewerRules['e1_farm'];

    const res = validateContentCatalog({
      rawRules: fewerRules,
      rawText: CARDS_TEXT_IT,
      rawArt: CARDS_ART,
      gddMarkdown: GDD_MARKDOWN,
    });
    expect(res.valid).toBe(false);
    expect(
      res.errors.some((e) => e.includes('Expected exactly 45 cards')),
    ).toBe(true);
    expect(
      res.errors.some((e) =>
        e.includes('Card ID "e1_farm" is missing in cards.rules.json'),
      ),
    ).toBe(true);
  });

  it('detects name > 24 chars, flavor > 120 chars, alt.it < 20 chars, and typeLine mismatch', () => {
    const badText = structuredClone(CARDS_TEXT_IT) as Record<
      string,
      { name: string; typeLine: string; flavor: string }
    >;
    badText['e1_farm'] = {
      name: 'Nome Eccessivamente Lungo Oltre Ventiquattro',
      typeLine: 'Tipo Errato',
      flavor: 'x'.repeat(125),
    };
    const badArt = structuredClone(CARDS_ART) as Record<
      string,
      (typeof CARDS_ART)[string]
    >;
    badArt['e1_farm'] = {
      ...badArt['e1_farm']!,
      alt: { it: 'Troppo corto' },
    };

    const res = validateContentCatalog({
      rawRules: CARDS_RULES,
      rawText: badText,
      rawArt: badArt,
      gddMarkdown: GDD_MARKDOWN,
    });
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('detects GDD rules text divergence, archer ATK mismatch, and missing final art file', () => {
    const modifiedRules = structuredClone(CARDS_RULES) as Record<
      string,
      CardRules
    >;
    modifiedRules['u1_arc_l'] = {
      ...modifiedRules['u1_arc_l']!,
      atk: 4, // diverges from GDD §7 (which is 2)
    };

    const modifiedArt = structuredClone(CARDS_ART) as Record<
      string,
      (typeof CARDS_ART)[string]
    >;
    modifiedArt['e1_farm'] = {
      ...modifiedArt['e1_farm']!,
      status: 'final',
      file: 'cards/non-existent-final.png',
    };

    const res = validateContentCatalog({
      rawRules: modifiedRules,
      rawText: CARDS_TEXT_IT,
      rawArt: modifiedArt,
      gddMarkdown: GDD_MARKDOWN,
      fileExists: () => false,
    });

    expect(res.valid).toBe(false);
    expect(
      res.errors.some((e) =>
        e.includes('Archer "u1_arc_l" expected base ATK 2'),
      ),
    ).toBe(true);
    expect(
      res.errors.some((e) =>
        e.includes('Card "u1_arc_l" generated rules text'),
      ),
    ).toBe(true);
    expect(
      res.errors.some((e) => e.includes('has status "final" but image file')),
    ).toBe(true);
  });

  it('throws in buildCardCatalog when text or art is missing for a rule ID', () => {
    const partialText = { ...CARDS_TEXT_IT };
    delete (partialText as Record<string, unknown>)['e1_farm'];
    expect(() =>
      buildCardCatalog(CARDS_RULES, partialText, CARDS_ART),
    ).toThrow(/Missing localized text entry/);

    const partialArt = { ...CARDS_ART };
    delete (partialArt as Record<string, unknown>)['e1_farm'];
    expect(() =>
      buildCardCatalog(CARDS_RULES, CARDS_TEXT_IT, partialArt),
    ).toThrow(/Missing art metadata entry/);
  });
});
