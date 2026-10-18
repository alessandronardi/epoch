import rawArtJson from '../../../data/cards.art.json' with { type: 'json' };
import rawRulesJson from '../../../data/cards.rules.json' with { type: 'json' };
import rawTextItJson from '../../../data/cards.text.it.json' with { type: 'json' };
import {
  CardsArtFileSchema,
  CardsRulesFileSchema,
  CardsTextFileSchema,
  type Ability,
  type ArtStatus,
  type CardArt,
  type CardEffect,
  type CardRules,
  type CardsArtFile,
  type CardsRulesFile,
  type CardsTextFile,
  type CardText,
  type CardType,
  type ConversionEffect,
  type EraNo,
  type InstantEffect,
  type Line,
  type Resource,
  type Resources,
  type UnitCategory,
} from '../../../data/schema/cards.schema.js';

export {
  CardsArtFileSchema,
  CardsRulesFileSchema,
  CardsTextFileSchema,
  type Ability,
  type ArtStatus,
  type CardArt,
  type CardEffect,
  type CardRules,
  type CardsArtFile,
  type CardsRulesFile,
  type CardsTextFile,
  type CardText,
  type CardType,
  type ConversionEffect,
  type EraNo,
  type InstantEffect,
  type Line,
  type Resource,
  type Resources,
  type UnitCategory,
};

export type SupportedLocale = 'it';

export type KeywordName =
  | 'Tiro'
  | 'Impalamento'
  | 'Accerchiamento'
  | 'Demolizione (DEM)'
  | 'Riconversione'
  | 'Istantanea';

export const KEYWORD_TOOLTIPS_IT: Readonly<Record<KeywordName, string>> =
  Object.freeze({
    Tiro: 'In Fase 1 gli Arcieri colpiscono prima del contatto; infliggono il bonus indicato se il nemico schiera almeno un Lanciere.',
    Impalamento:
      'In Fase 2A i Lancieri infliggono questo danno speciale solo alla Cavalleria nemica, prima che possa caricare.',
    Accerchiamento:
      'In Fase 2B, se il nemico non ha Lancieri vivi, la Cavalleria attacca per prima la Retroguardia e ottiene il bonus contro gli Arcieri.',
    'Demolizione (DEM)':
      'Danno strutturale: in caso di vittoria campale colpisce le Mura nemiche e, in eccesso, il Centro Città. Non danneggia le truppe.',
    Riconversione:
      "Giocabile solo durante lo sviluppo dell'Era III; occupa 0 slot ma richiede il sacrificio di un tuo Edificio Economico attivo.",
    Istantanea:
      'Si seleziona in segreto nella Finestra Pre-Battaglia (dopo la rivelazione delle unità) e si rivela simultaneamente; occupa 0 slot.',
  });

export function getKeywordTooltip(
  keyword: KeywordName,
  _locale: SupportedLocale = 'it',
): string {
  return KEYWORD_TOOLTIPS_IT[keyword];
}

const RESOURCE_LABELS_IT: Readonly<Record<Resource, string>> = Object.freeze({
  food: 'Cibo',
  wood: 'Legno',
  metal: 'Metallo',
});

const CATEGORY_LABELS_IT: Readonly<Record<UnitCategory, string>> =
  Object.freeze({
    infantry: 'Fanteria',
    spearman: 'Lanciere',
    cavalry: 'Cavalleria',
    archer: 'Arciere',
    siege: 'Assedio',
  });

const LINE_LABELS_IT: Readonly<Record<Line, string>> = Object.freeze({
  front: 'Fronte',
  center: 'Centro',
  rear: 'Retroguardia',
});

export function computeArcherMeleeAtk(effectiveAtk: number): number {
  return Math.max(1, Math.floor(effectiveAtk / 2));
}

export function formatTypeLine(
  card: CardRules,
  _locale: SupportedLocale = 'it',
): string {
  switch (card.type) {
    case 'economy':
      return 'Economia';
    case 'instant':
      return 'Istantanea';
    case 'conversion':
      return 'Riconversione';
    case 'unit': {
      if (card.category === undefined || card.line === undefined) {
        throw new Error(
          `Unit card "${card.id}" is missing category or line for typeLine formatting.`,
        );
      }
      return `Unità — ${CATEGORY_LABELS_IT[card.category]} · ${LINE_LABELS_IT[card.line]}`;
    }
  }
}

function formatPositiveResourcesList(
  resources: Resources,
  includeEmoji = false,
): string {
  const order: readonly Resource[] = ['food', 'wood', 'metal'];
  const emojiMap: Readonly<Record<Resource, string>> = {
    food: '🍖',
    wood: '🪵',
    metal: '⛏️',
  };
  const parts: string[] = [];
  for (const res of order) {
    const val = resources[res];
    if (val > 0) {
      const label = includeEmoji ? emojiMap[res] : RESOURCE_LABELS_IT[res];
      parts.push(`+${val} ${label}`);
    }
  }
  return parts.join(', ');
}

export function generateRulesText(
  card: CardRules,
  _locale: SupportedLocale = 'it',
): string {
  switch (card.type) {
    case 'economy': {
      if (!card.production) {
        throw new Error(`Economy card "${card.id}" is missing production.`);
      }
      const prodText = formatPositiveResourcesList(card.production, false);
      return `Produzione: ${prodText}.`;
    }

    case 'unit': {
      if (card.category === 'siege' || card.isCombatant === false) {
        return 'Non combattente; solo Demolizione.';
      }
      const ability = card.abilities[0];
      if (!ability) {
        return 'Unità combattente.';
      }
      switch (ability.kind) {
        case 'impale':
          return `Impalamento: ${ability.damage} danni vs Cavalleria.`;
        case 'volley': {
          const meleeAtk = computeArcherMeleeAtk(card.atk ?? 1);
          return `Tiro (+${ability.bonusVsSpearman} vs Lancieri); Mischia: ${meleeAtk} ATK.`;
        }
        case 'flank':
          return `Accerchiamento (+${ability.bonusVsArcher} ATK vs Arcieri).`;
      }
      break;
    }

    case 'instant': {
      if (
        !card.effect ||
        (card.effect.kind !== 'atk_mod' && card.effect.kind !== 'walls_mod')
      ) {
        throw new Error(
          `Instant card "${card.id}" has missing or invalid InstantEffect.`,
        );
      }
      if (card.effect.kind === 'atk_mod') {
        const signVal =
          card.effect.amount >= 0
            ? `+${card.effect.amount}`
            : `${card.effect.amount}`;
        const targetText =
          card.effect.target === 'own_archers'
            ? 'ai tuoi Arcieri'
            : 'alle tue unità sul Fronte';
        return `Pre-Battaglia (0 Slot): ${signVal} ATK ${targetText}.`;
      }
      const signVal =
        card.effect.amount >= 0
          ? `+${card.effect.amount}`
          : `${card.effect.amount}`;
      const targetText =
        card.effect.target === 'own' ? 'alle tue Mura' : 'alle Mura nemiche';
      return `Pre-Battaglia (0 Slot): ${signVal} HP ${targetText}.`;
    }

    case 'conversion': {
      if (
        !card.effect ||
        (card.effect.kind !== 'gain_per_building' &&
          card.effect.kind !== 'gain_and_dem_bonus')
      ) {
        throw new Error(
          `Conversion card "${card.id}" has missing or invalid ConversionEffect.`,
        );
      }
      if (card.effect.kind === 'gain_per_building') {
        const gainText = formatPositiveResourcesList(
          card.effect.perBuilding,
          false,
        );
        return `0 Slot. Sacrifica 1 tuo Edificio: ${gainText} per tuo edificio pre-sacrificio.`;
      }
      const gainText = formatPositiveResourcesList(card.effect.gain, false);
      return `0 Slot. Sacrifica 1 tuo Edificio: ${gainText} e +${card.effect.demBonus} DEM alle tue unità in Era III.`;
    }
  }
}

export function getCardKeywords(card: CardRules): KeywordName[] {
  const keywords: KeywordName[] = [];

  for (const ability of card.abilities) {
    if (ability.kind === 'volley' && !keywords.includes('Tiro')) {
      keywords.push('Tiro');
    } else if (ability.kind === 'impale' && !keywords.includes('Impalamento')) {
      keywords.push('Impalamento');
    } else if (
      ability.kind === 'flank' &&
      !keywords.includes('Accerchiamento')
    ) {
      keywords.push('Accerchiamento');
    }
  }

  if (
    (card.dem !== undefined && card.dem > 0) ||
    card.category === 'siege' ||
    card.effect?.kind === 'gain_and_dem_bonus'
  ) {
    keywords.push('Demolizione (DEM)');
  }

  if (card.type === 'conversion') {
    keywords.push('Riconversione');
  }

  if (card.type === 'instant') {
    keywords.push('Istantanea');
  }

  return keywords;
}

export interface CatalogCard {
  readonly id: string;
  readonly rules: CardRules;
  readonly text: CardText;
  readonly rulesText: string;
  readonly keywords: readonly KeywordName[];
  readonly art: CardArt;
}

export interface CardCatalog {
  readonly rulesById: Readonly<Record<string, CardRules>>;
  readonly textById: Readonly<Record<string, CardText>>;
  readonly artById: Readonly<Record<string, CardArt>>;
  readonly cardsById: Readonly<Record<string, CatalogCard>>;
  readonly allCards: readonly CatalogCard[];
}

export function buildCardCatalog(
  rawRules: unknown,
  rawText: unknown,
  rawArt: unknown,
  locale: SupportedLocale = 'it',
): CardCatalog {
  const rulesById = CardsRulesFileSchema.parse(rawRules);
  const textById = CardsTextFileSchema.parse(rawText);
  const artById = CardsArtFileSchema.parse(rawArt);

  const ruleIds = Object.keys(rulesById).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const cardsById: Record<string, CatalogCard> = {};
  const allCards: CatalogCard[] = [];

  for (const id of ruleIds) {
    const rules = rulesById[id]!;
    const text = textById[id];
    if (!text) {
      throw new Error(`Missing localized text entry for card "${id}".`);
    }
    const art = artById[id];
    if (!art) {
      throw new Error(`Missing art metadata entry for card "${id}".`);
    }
    const rulesText = generateRulesText(rules, locale);
    const keywords = Object.freeze(getCardKeywords(rules));

    const entry: CatalogCard = Object.freeze({
      id,
      rules,
      text,
      rulesText,
      keywords,
      art,
    });
    cardsById[id] = entry;
    allCards.push(entry);
  }

  return Object.freeze({
    rulesById: Object.freeze(rulesById),
    textById: Object.freeze(textById),
    artById: Object.freeze(artById),
    cardsById: Object.freeze(cardsById),
    allCards: Object.freeze(allCards),
  });
}

let cachedCatalogIt: CardCatalog | null = null;

export function loadCardCatalog(locale: SupportedLocale = 'it'): CardCatalog {
  if (locale === 'it' && cachedCatalogIt !== null) {
    return cachedCatalogIt;
  }
  const catalog = buildCardCatalog(rawRulesJson, rawTextItJson, rawArtJson, locale);
  if (locale === 'it') {
    cachedCatalogIt = catalog;
  }
  return catalog;
}

export const CARD_CATALOG: CardCatalog = loadCardCatalog('it');
export const CARDS_RULES: Readonly<Record<string, CardRules>> =
  CARD_CATALOG.rulesById;
export const CARDS_TEXT_IT: Readonly<Record<string, CardText>> =
  CARD_CATALOG.textById;
export const CARDS_ART: Readonly<Record<string, CardArt>> =
  CARD_CATALOG.artById;

export function getCard(cardId: string): CatalogCard {
  const card = CARD_CATALOG.cardsById[cardId];
  if (!card) {
    throw new Error(`Unknown cardId "${cardId}" in @epochs/content catalog.`);
  }
  return card;
}
