// TECH-SPEC §7.1 — Interfaccia Bot e implementazione di RandomBot che opera esclusivamente su PlayerView.

import {
  ZERO_RESOURCES,
  addResources,
  canAfford,
  type CardRules,
  type ClientCommand,
  type LegalCommands,
  type PlayCardClientCommand,
  type PlayConversionClientCommand,
  type PlayerView,
  type Resources,
} from '../../engine/src/index.js';

/**
 * Contratto per tutti i bot di The Epochs (TECH-SPEC §7.1).
 * Riceve esclusivamente la `PlayerView` filtrata del giocatore e una funzione `rng` deterministica `[0, 1)`,
 * senza alcun accesso allo stato nascosto `GameState`.
 */
export interface Bot {
  readonly name: string;
  choose(view: PlayerView, rng: () => number): ClientCommand;
}

/**
 * Probabilità predefinita di `Pass` per `RandomBot` quando esistono carte giocabili (15% — TECH-SPEC §7.1).
 */
export const DEFAULT_RANDOM_BOT_PASS_PROBABILITY = 0.15;

export interface RandomBotOptions {
  readonly name?: string;
  readonly passProbability?: number;
  readonly catalog?: Readonly<Record<string, CardRules>>;
}

const MAX_UNIT_FLOAT = 1 - Number.EPSILON;

/**
 * Normalizza un valore estratto da `rng()` nell'intervallo semi-aperto `[0, 1)`.
 */
export function clampUnitRandom(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return MAX_UNIT_FLOAT;
  }
  return value;
}

/**
 * Estrae un intero uniforme in `[minInclusive, maxInclusive]` usando `rng`.
 */
export function pickRandomInt(
  rng: () => number,
  minInclusive: number,
  maxInclusive: number,
): number {
  if (maxInclusive <= minInclusive) {
    return minInclusive;
  }
  const span = maxInclusive - minInclusive + 1;
  return minInclusive + Math.floor(clampUnitRandom(rng()) * span);
}

/**
 * Seleziona uniformemente un elemento da un array non vuoto usando `rng`.
 */
export function pickRandomElement<T>(
  items: readonly T[],
  rng: () => number,
): T {
  if (items.length === 0) {
    throw new Error('Cannot pick a random element from an empty array.');
  }
  const idx = pickRandomInt(rng, 0, items.length - 1);
  return items[idx]!;
}

/**
 * Estrae `count` elementi distinti in modo uniforme da `items` tramite Fisher-Yates parziale.
 */
export function sampleDistinct<T>(
  items: readonly T[],
  count: number,
  rng: () => number,
): T[] {
  const targetCount = Math.max(0, Math.min(count, items.length));
  if (targetCount === 0) {
    return [];
  }
  const copy = items.slice();
  for (let i = 0; i < targetCount; i++) {
    const j = pickRandomInt(rng, i, copy.length - 1);
    const temp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = temp;
  }
  return copy.slice(0, targetCount);
}

/**
 * Costruisce l'elenco ordinato di tutte le mosse di giocata carta (`PlayCard` e `PlayConversion`)
 * legalmente disponibili in `development` a partire da `view.self.legal`.
 */
export function enumeratePlayableDevelopmentMoves(
  legal: Readonly<LegalCommands>,
): Array<PlayCardClientCommand | PlayConversionClientCommand> {
  const moves: Array<PlayCardClientCommand | PlayConversionClientCommand> = [];

  for (const cardUid of legal.playableFieldCardUids) {
    moves.push({
      type: 'PlayCard',
      cardUid,
    });
  }

  for (const cardUid of legal.playableConversionUids) {
    for (const sacrificeUid of legal.sacrificableBuildingUids) {
      moves.push({
        type: 'PlayConversion',
        cardUid,
        sacrificeUid,
      });
    }
  }

  return moves;
}

/**
 * Costruisce l'elenco dei sottoinsiemi non vuoti di Istantanee giocabili in `prebattle`.
 * - Se `catalog` è fornito, enumera tutti i sottoinsiemi non vuoti di `playableInstantUids` il cui costo aggregato
 *   è sostenibile con `view.self.resources`.
 * - Se `catalog` non è fornito, restituisce tutti i singoletti `[uid]` da `playableInstantUids`
 *   (ciascuno già garantito sostenibile individualmente da `view.self.legal`).
 */
export function enumeratePlayableInstantSubsets(
  view: Readonly<PlayerView>,
  catalog?: Readonly<Record<string, CardRules>>,
): string[][] {
  const playableUids = view.self.legal.playableInstantUids;
  if (playableUids.length === 0) {
    return [];
  }

  if (catalog === undefined) {
    return playableUids.map((uid) => [uid]);
  }

  const definedCatalog = catalog;
  const handMap = new Map(view.self.hand.map((c) => [c.uid, c.cardId]));
  const validSubsets: string[][] = [];

  function backtrack(
    startIndex: number,
    currentUids: string[],
    currentCost: Resources,
  ): void {
    for (let i = startIndex; i < playableUids.length; i++) {
      const uid = playableUids[i]!;
      const cardId = handMap.get(uid);
      const rules = cardId !== undefined ? definedCatalog[cardId] : undefined;
      if (rules === undefined) {
        continue;
      }
      const nextCost = addResources(currentCost, rules.cost);
      if (canAfford(view.self.resources, nextCost)) {
        const nextUids = [...currentUids, uid];
        validSubsets.push(nextUids);
        backtrack(i + 1, nextUids, nextCost);
      }
    }
  }

  backtrack(0, [], { ...ZERO_RESOURCES });
  return validSubsets.length > 0
    ? validSubsets
    : playableUids.map((uid) => [uid]);
}

/**
 * Implementazione di `RandomBot` (TECH-SPEC §7.1):
 * - opera esclusivamente su `PlayerView` e sceglie sempre tra le mosse in `view.self.legal`;
 * - gestisce `mulligan`, `hand_limit`, `development` e `prebattle`;
 * - in `development` applica una probabilità configurabile di `Pass` (default `0.15`) quando esistono carte giocabili,
 *   altrimenti sceglie uniformemente tra tutte le mosse di giocata disponibili.
 */
export class RandomBot implements Bot {
  public readonly name: string;
  public readonly passProbability: number;
  private readonly catalog: Readonly<Record<string, CardRules>> | undefined;

  public constructor(options: RandomBotOptions = {}) {
    const passProbability =
      options.passProbability ?? DEFAULT_RANDOM_BOT_PASS_PROBABILITY;
    if (
      !Number.isFinite(passProbability) ||
      passProbability < 0 ||
      passProbability > 1
    ) {
      throw new RangeError(
        `RandomBot passProbability must be a finite number in [0, 1], received ${String(passProbability)}.`,
      );
    }

    this.name = options.name ?? 'RandomBot';
    this.passProbability = passProbability;
    this.catalog = options.catalog;
  }

  public choose(view: PlayerView, rng: () => number): ClientCommand {
    const { legal } = view.self;

    if (!legal.canAct || view.phase === 'finished') {
      throw new Error(
        `RandomBot cannot choose a command for player ${view.me} in phase "${view.phase}" when canAct is false.`,
      );
    }

    switch (view.phase) {
      case 'mulligan': {
        if (!legal.canSubmitMulligan) {
          throw new Error(
            `RandomBot cannot submit mulligan for player ${view.me} when canSubmitMulligan is false.`,
          );
        }
        const maxCount = Math.min(legal.maxMulliganCards, view.self.hand.length);
        const countToMulligan = pickRandomInt(rng, 0, maxCount);
        const handUids = view.self.hand.map((c) => c.uid);
        const cardUids = sampleDistinct(handUids, countToMulligan, rng);
        return {
          type: 'SubmitMulligan',
          cardUids,
        };
      }

      case 'hand_limit': {
        if (!legal.canSubmitDiscard) {
          throw new Error(
            `RandomBot cannot submit discard for player ${view.me} when canSubmitDiscard is false.`,
          );
        }
        const handUids = view.self.hand.map((c) => c.uid);
        const cardUids = sampleDistinct(handUids, legal.mustDiscardCount, rng);
        return {
          type: 'SubmitDiscard',
          cardUids,
        };
      }

      case 'development': {
        const playableMoves = enumeratePlayableDevelopmentMoves(legal);
        if (playableMoves.length === 0) {
          return { type: 'Pass' };
        }

        if (
          legal.canPass &&
          this.passProbability > 0 &&
          clampUnitRandom(rng()) < this.passProbability
        ) {
          return { type: 'Pass' };
        }

        return pickRandomElement(playableMoves, rng);
      }

      case 'prebattle': {
        if (!legal.canLockInstants) {
          throw new Error(
            `RandomBot cannot lock instants for player ${view.me} when canLockInstants is false.`,
          );
        }

        const nonEmptySubsets = enumeratePlayableInstantSubsets(
          view,
          this.catalog,
        );
        if (nonEmptySubsets.length === 0) {
          return {
            type: 'LockInstants',
            cardUids: [],
          };
        }

        if (
          this.passProbability > 0 &&
          clampUnitRandom(rng()) < this.passProbability
        ) {
          return {
            type: 'LockInstants',
            cardUids: [],
          };
        }

        const allOptions: string[][] = [[], ...nonEmptySubsets];
        const chosenUids = pickRandomElement(allOptions, rng);
        return {
          type: 'LockInstants',
          cardUids: chosenUids,
        };
      }
    }
  }
}
