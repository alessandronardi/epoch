// TECH-SPEC §7.1 — Implementazione di GreedyBot e RationalBot operanti esclusivamente su PlayerView.

import rawRulesJson from '../../../data/cards.rules.json' with { type: 'json' };
import {
  RESOURCE_KEYS,
  ZERO_RESOURCES,
  addResources,
  autoDiscard,
  canAfford,
  effectiveCardCost,
  getTotalCardCost,
  type CardInstance,
  type CardRules,
  type ClientCommand,
  type Line,
  type PlayConversionClientCommand,
  type PlayerView,
  type Resources,
} from '../../engine/src/index.js';
import { enumeratePlayableDevelopmentMoves, type Bot } from './random-bot.js';

/**
 * Catalogo predefinito delle 45 carte ufficiali caricato da `data/cards.rules.json`.
 */
export const DEFAULT_BOT_CATALOG: Readonly<Record<string, CardRules>> = Object.freeze(
  structuredClone(rawRulesJson as unknown as Record<string, CardRules>),
);

export interface GreedyBotOptions {
  readonly name?: string;
  readonly catalog?: Readonly<Record<string, CardRules>>;
}

export type RationalBotOptions = GreedyBotOptions;

export type BotKind = 'random' | 'greedy' | 'rational';

function resolveBotOptions(
  optionsOrCatalog: GreedyBotOptions | Readonly<Record<string, CardRules>> | undefined,
  defaultName: string,
): { name: string; catalog: Readonly<Record<string, CardRules>> } {
  if (optionsOrCatalog === undefined) {
    return {
      name: defaultName,
      catalog: DEFAULT_BOT_CATALOG,
    };
  }

  if ('name' in optionsOrCatalog || 'catalog' in optionsOrCatalog) {
    const opts = optionsOrCatalog as GreedyBotOptions;
    return {
      name: opts.name ?? defaultName,
      catalog: opts.catalog ?? DEFAULT_BOT_CATALOG,
    };
  }

  return {
    name: defaultName,
    catalog: optionsOrCatalog as Readonly<Record<string, CardRules>>,
  };
}

function lookupRulesByUid(
  cards: readonly CardInstance[],
  uid: string,
  catalog: Readonly<Record<string, CardRules>>,
): CardRules | undefined {
  const card = cards.find((c) => c.uid === uid);
  if (card === undefined) {
    return undefined;
  }
  return catalog[card.cardId];
}

/**
 * Calcola il rapporto di efficienza di un'unità secondo TECH-SPEC §7.1:
 * `(ATK + DEM + HP) / max(1, costoTotale)`.
 */
export function calculateUnitEfficiency(card: Readonly<CardRules>): number {
  if (
    card.type !== 'unit' ||
    card.atk === undefined ||
    card.dem === undefined ||
    card.hp === undefined
  ) {
    return 0;
  }
  const totalCost = Math.max(1, getTotalCardCost(card));
  return (card.atk + card.dem + card.hp) / totalCost;
}

/**
 * Calcola la DEM totale effettiva delle unità schierate dal giocatore o dall'avversario (se rivelate),
 * includendo il `demBonus` di Era III (*Altoforno Reale*, R4).
 */
export function calculateTotalDemForView(
  unitCardIds: readonly string[],
  era: number,
  demBonus: number,
  catalog: Readonly<Record<string, CardRules>>,
): number {
  let total = 0;
  const bonusPerUnit = era === 3 ? demBonus : 0;
  for (const cardId of unitCardIds) {
    const rules = catalog[cardId];
    if (rules !== undefined && rules.type === 'unit' && rules.dem !== undefined) {
      total += rules.dem + bonusPerUnit;
    }
  }
  return total;
}

/**
 * Determina se il bot prevede/teme di subire una breccia nemica nella battaglia dell'Era corrente,
 * utilizzando esclusivamente le informazioni visibili in `PlayerView`.
 */
export function predictsEnemyBreach(
  view: Readonly<PlayerView>,
  catalog: Readonly<Record<string, CardRules>> = DEFAULT_BOT_CATALOG,
  extraOwnWalls = 0,
): boolean {
  const effectiveOwnWalls = Math.max(0, view.self.walls + extraOwnWalls);

  // In prebattle le unità avversarie sono rivelate (R1)
  if (view.opponent.units !== null) {
    let enemyCombatants = 0;
    const enemyCardIds: string[] = [];

    for (const u of view.opponent.units) {
      enemyCardIds.push(u.cardId);
      const rules = catalog[u.cardId];
      if (rules !== undefined && rules.isCombatant !== false) {
        enemyCombatants += 1;
      }
    }

    if (enemyCombatants === 0) {
      return false;
    }

    const enemyTotalDem = calculateTotalDemForView(
      enemyCardIds,
      view.era,
      view.opponent.demBonus,
      catalog,
    );

    return enemyTotalDem > 0 && enemyTotalDem >= effectiveOwnWalls;
  }

  // Durante development (prima di UnitsRevealed), stima il rischio di breccia
  // dai segnali pubblici dell'avversario (slotsUsed, demBonus, coveredCount) rispetto alle nostre Mura e difese.
  const opponentDeployed = Math.max(view.opponent.slotsUsed, view.opponent.coveredCount);
  if (opponentDeployed === 0) {
    return false;
  }

  let ownCombatants = 0;
  for (const u of view.self.units) {
    const rules = catalog[u.cardId];
    if (rules !== undefined && rules.isCombatant !== false) {
      ownCombatants += 1;
    }
  }

  const estimatedDemPerEnemySlot = view.era + (view.era === 3 ? view.opponent.demBonus : 0);
  const estimatedEnemyDem = opponentDeployed * estimatedDemPerEnemySlot;

  return estimatedEnemyDem >= effectiveOwnWalls && ownCombatants <= opponentDeployed;
}

/**
 * Implementazione di `GreedyBot` (TECH-SPEC §7.1):
 * - *Mulligan*: tiene gli edifici economici di Era I e le unità a basso costo; cambia le carte ridondanti se non ha edifici in mano.
 * - *Hand limit*: scarta le carte a minor utilità prospettica (con tie-break deterministico FIFO).
 * - *Sviluppo*: nei Cicli 1 e 2 dà priorità massima agli Edifici Economici; successivamente schiera Unità
 *   bilanciando le linee e massimizzando `(ATK + DEM + HP) / costoTotale`; in Era III usa *Gilda dei Mercanti*
 *   quando ha `>= 3` edifici o *Altoforno Reale* quando ha già schierato più unità (`>= 2`).
 * - *Pre-Battaglia*: gioca *Pioggia di Frecce* con `>= 2` Arcieri; *Grido di Guerra* / *Carica Eroica* con `>= 2` unità sul Fronte;
 *   *Mina Sotterranea* / *Fuoco Greco* se la propria DEM totale può aprire una breccia o infliggere danno diretto al Centro Città;
 *   *Palizzata Extra* se teme una breccia nemica.
 */
export class GreedyBot implements Bot {
  public readonly name: string;
  protected readonly catalog: Readonly<Record<string, CardRules>>;

  public constructor(optionsOrCatalog?: GreedyBotOptions | Readonly<Record<string, CardRules>>) {
    const resolved = resolveBotOptions(optionsOrCatalog, 'GreedyBot');
    this.name = resolved.name;
    this.catalog = resolved.catalog;
  }

  public choose(view: PlayerView, _rng: () => number): ClientCommand {
    const { legal } = view.self;

    if (!legal.canAct || view.phase === 'finished') {
      throw new Error(
        `${this.name} cannot choose a command for player ${view.me} in phase "${view.phase}" when canAct is false.`,
      );
    }

    switch (view.phase) {
      case 'mulligan':
        return this.chooseMulligan(view);
      case 'hand_limit':
        return this.chooseDiscard(view);
      case 'development':
        return this.chooseDevelopment(view);
      case 'prebattle':
        return this.choosePrebattle(view);
    }
  }

  protected chooseMulligan(view: Readonly<PlayerView>): ClientCommand {
    const { legal, hand } = view.self;
    if (!legal.canSubmitMulligan) {
      throw new Error(
        `${this.name} cannot submit mulligan for player ${view.me} when canSubmitMulligan is false.`,
      );
    }

    const maxMulligan = Math.min(legal.maxMulliganCards, hand.length);
    const economyCards = hand.filter((c) => this.catalog[c.cardId]?.type === 'economy');
    const hasEconomyInHand = economyCards.length > 0;
    const hasMineInHand = economyCards.some((c) => {
      const prod = this.catalog[c.cardId]?.production;
      return prod !== undefined && prod.metal > 0;
    });

    const cardUidsToMulligan: string[] = [];
    const keptCountsByCardId = new Map<string, number>();
    let keptLowCostUnits = 0;

    for (const card of hand) {
      const rules = this.catalog[card.cardId];
      if (rules === undefined) {
        continue;
      }

      // Tiene sempre gli edifici economici di Era I
      if (rules.type === 'economy') {
        keptCountsByCardId.set(card.cardId, (keptCountsByCardId.get(card.cardId) ?? 0) + 1);
        continue;
      }

      const totalCost = getTotalCardCost(rules);
      const prevKept = keptCountsByCardId.get(card.cardId) ?? 0;

      if (!hasEconomyInHand) {
        // Se non ha edifici in mano: tiene solo unità a basso costo (<= 2, senza metallo) non ridondanti (max 2 totali)
        const isKeepableLowCostUnit =
          rules.type === 'unit' &&
          rules.isCombatant !== false &&
          totalCost <= 2 &&
          rules.cost.metal === 0 &&
          prevKept === 0 &&
          keptLowCostUnits < 2;

        if (isKeepableLowCostUnit) {
          keptCountsByCardId.set(card.cardId, prevKept + 1);
          keptLowCostUnits += 1;
        } else {
          cardUidsToMulligan.push(card.uid);
        }
      } else {
        // Ha almeno un edificio economico: tiene le unità a basso costo (<= 3) non ridondanti
        const needsMetalWithoutMine = rules.cost.metal > 0 && !hasMineInHand;
        const isLowCostUnit =
          rules.type === 'unit' && totalCost <= 3 && !needsMetalWithoutMine && prevKept < 2;

        if (isLowCostUnit) {
          keptCountsByCardId.set(card.cardId, prevKept + 1);
        } else {
          cardUidsToMulligan.push(card.uid);
        }
      }
    }

    return {
      type: 'SubmitMulligan',
      cardUids: cardUidsToMulligan.slice(0, maxMulligan),
    };
  }

  protected chooseDiscard(view: Readonly<PlayerView>): ClientCommand {
    const { legal, hand } = view.self;
    if (!legal.canSubmitDiscard) {
      throw new Error(
        `${this.name} cannot submit discard for player ${view.me} when canSubmitDiscard is false.`,
      );
    }

    const count = legal.mustDiscardCount;
    const allKnown = hand.every((c) => this.catalog[c.cardId] !== undefined);
    if (!allKnown) {
      return {
        type: 'SubmitDiscard',
        cardUids: autoDiscard(hand, this.catalog, count),
      };
    }

    const seenByCardId = new Map<string, number>();
    const scored = hand.map((card) => {
      const rules = this.catalog[card.cardId]!;
      const copyIndex = (seenByCardId.get(card.cardId) ?? 0) + 1;
      seenByCardId.set(card.cardId, copyIndex);

      let keepScore = rules.era * 10;
      if (rules.type === 'economy') {
        keepScore += view.era < 3 ? 25 : -15;
      } else if (rules.type === 'conversion') {
        keepScore += 30;
      } else if (rules.type === 'unit') {
        keepScore += calculateUnitEfficiency(rules) * 5;
      } else {
        keepScore += 8;
      }

      if (copyIndex > 2) {
        keepScore -= 12;
      }

      return {
        card,
        rules,
        keepScore,
        totalCost: getTotalCardCost(rules),
      };
    });

    scored.sort((a, b) => {
      if (a.keepScore !== b.keepScore) {
        return a.keepScore - b.keepScore;
      }
      if (a.rules.era !== b.rules.era) {
        return a.rules.era - b.rules.era;
      }
      if (a.totalCost !== b.totalCost) {
        return a.totalCost - b.totalCost;
      }
      return a.card.drawnOrder - b.card.drawnOrder;
    });

    return {
      type: 'SubmitDiscard',
      cardUids: scored.slice(0, count).map((entry) => entry.card.uid),
    };
  }

  protected chooseDevelopment(view: Readonly<PlayerView>): ClientCommand {
    const { legal, hand, buildings } = view.self;
    const playableMoves = enumeratePlayableDevelopmentMoves(legal);

    if (playableMoves.length === 0) {
      return { type: 'Pass' };
    }
    // Exchange only when it makes a card affordable; do not churn resources.
    for (const cmd of legal.marketCommands ?? []) {
      const after = { ...view.self.resources };
      after[cmd.give] -= 2;
      after[cmd.receive] += 1;
      if (
        hand.some((c) => {
          const card = this.catalog[c.cardId];
          if (!card || card.type === 'instant') return false;
          const cost = effectiveCardCost(card, view.self, view.rulesetVersion);
          return !canAfford(view.self.resources, cost) && canAfford(after, cost);
        })
      )
        return cmd;
    }
    if (view.era < 3 && view.self.units.length >= 1) {
      const support = legal.playableFieldCardUids.find((uid) => {
        const card = lookupRulesByUid(hand, uid, this.catalog);
        return (
          card?.type === 'structure' &&
          !(view.self.structures ?? []).some(
            (c) => this.catalog[c.cardId]?.structureEffect?.kind === card.structureEffect?.kind,
          )
        );
      });
      if (support) return { type: 'PlayCard', cardUid: support };
    }

    // 1. In Era III: valuta Riconversioni (Gilda dei Mercanti con >= 3 edifici; Altoforno Reale con >= 2 unità)
    if (
      view.era === 3 &&
      legal.playableConversionUids.length > 0 &&
      legal.sacrificableBuildingUids.length > 0
    ) {
      const conversionMove = this.pickStrategicConversionMove(view);
      if (conversionMove !== null) {
        return conversionMove;
      }
    }

    // Raggruppa le carte da campo giocabili in Edifici Economici e Unità
    const playableEconomyCards: Array<{ uid: string; rules: CardRules }> = [];
    const playableUnitCards: Array<{ uid: string; rules: CardRules }> = [];

    for (const uid of legal.playableFieldCardUids) {
      const rules = lookupRulesByUid(hand, uid, this.catalog);
      if (rules?.type === 'economy') {
        playableEconomyCards.push({ uid, rules });
      } else if (rules?.type === 'unit') {
        playableUnitCards.push({ uid, rules });
      }
    }

    // 2. Nei Cicli 1 e 2 dà priorità massima agli Edifici Economici per massimizzare le rendite dei Cicli 2 e 3
    if (view.cycle <= 2 && playableEconomyCards.length > 0) {
      const bestEconomy = this.pickBestEconomyCard(view, playableEconomyCards);
      return {
        type: 'PlayCard',
        cardUid: bestEconomy.uid,
      };
    }

    // 3. Schiera Unità bilanciando le linee e massimizzando (ATK + DEM + HP) / costoTotale
    if (playableUnitCards.length > 0) {
      const bestUnit = this.pickBestUnitCard(view, playableUnitCards);
      return {
        type: 'PlayCard',
        cardUid: bestUnit.uid,
      };
    }

    // 4. Nel Ciclo 3 se non ci sono Unità giocabili ma ci sono Edifici Economici giocabili:
    // in Era I e II conviene comunque costruirli per il Raccolto 2x dell'Era successiva,
    // oppure in Era III se servono edifici per sbloccare una Riconversione in mano.
    if (playableEconomyCards.length > 0) {
      const hasConversionInHand = hand.some((c) => this.catalog[c.cardId]?.type === 'conversion');
      if (view.era < 3 || (hasConversionInHand && buildings.length < 3)) {
        const bestEconomy = this.pickBestEconomyCard(view, playableEconomyCards);
        return {
          type: 'PlayCard',
          cardUid: bestEconomy.uid,
        };
      }
    }

    return { type: 'Pass' };
  }

  protected pickStrategicConversionMove(
    view: Readonly<PlayerView>,
  ): PlayConversionClientCommand | null {
    const { legal, hand, buildings, units } = view.self;
    const sacrificeUid = this.pickBestBuildingToSacrifice(view);
    if (sacrificeUid === null) {
      return null;
    }

    let guildUid: string | null = null;
    let furnaceUid: string | null = null;

    for (const uid of legal.playableConversionUids) {
      const rules = lookupRulesByUid(hand, uid, this.catalog);
      if (
        rules?.effect?.kind === 'gain_per_building' &&
        buildings.length >= 3 &&
        guildUid === null
      ) {
        guildUid = uid;
      } else if (
        rules?.effect?.kind === 'gain_and_dem_bonus' &&
        units.length >= 2 &&
        furnaceUid === null
      ) {
        furnaceUid = uid;
      }
    }

    if (guildUid !== null && furnaceUid !== null) {
      const chosenUid = buildings.length > units.length ? guildUid : furnaceUid;
      return {
        type: 'PlayConversion',
        cardUid: chosenUid,
        sacrificeUid,
      };
    }

    if (guildUid !== null) {
      return {
        type: 'PlayConversion',
        cardUid: guildUid,
        sacrificeUid,
      };
    }

    if (furnaceUid !== null) {
      return {
        type: 'PlayConversion',
        cardUid: furnaceUid,
        sacrificeUid,
      };
    }

    return null;
  }

  protected pickBestBuildingToSacrifice(view: Readonly<PlayerView>): string | null {
    const { legal, buildings, resources } = view.self;
    if (legal.sacrificableBuildingUids.length === 0) {
      return null;
    }

    let bestUid = legal.sacrificableBuildingUids[0]!;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const uid of legal.sacrificableBuildingUids) {
      const rules = lookupRulesByUid(buildings, uid, this.catalog);
      const prod = rules?.production ?? ZERO_RESOURCES;
      const totalProd = prod.food + prod.wood + prod.metal;

      let stockOfProducedResource = 0;
      for (const r of RESOURCE_KEYS) {
        if (prod[r] > 0) {
          stockOfProducedResource += resources[r] * prod[r];
        }
      }

      const sacrificeScore = totalProd * 100 - stockOfProducedResource;
      if (sacrificeScore < bestScore) {
        bestScore = sacrificeScore;
        bestUid = uid;
      }
    }

    return bestUid;
  }

  protected pickBestEconomyCard(
    view: Readonly<PlayerView>,
    candidates: ReadonlyArray<{ uid: string; rules: CardRules }>,
  ): { uid: string; rules: CardRules } {
    const currentProd: Resources = { food: 0, wood: 0, metal: 0 };
    for (const b of view.self.buildings) {
      const bRules = this.catalog[b.cardId];
      if (bRules?.production !== undefined) {
        currentProd.food += bRules.production.food;
        currentProd.wood += bRules.production.wood;
        currentProd.metal += bRules.production.metal;
      }
    }

    let best = candidates[0]!;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates) {
      const prod = candidate.rules.production ?? ZERO_RESOURCES;
      const totalProd = prod.food + prod.wood + prod.metal;

      let scarcityBonus = 0;
      for (const r of RESOURCE_KEYS) {
        if (prod[r] > 0) {
          const effectiveSupply = currentProd[r] * 2 + view.self.resources[r];
          scarcityBonus += prod[r] * Math.max(0, 10 - effectiveSupply) * 0.1;
        }
      }

      const score = totalProd * 10 + scarcityBonus - getTotalCardCost(candidate.rules) * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  }

  protected pickBestUnitCard(
    view: Readonly<PlayerView>,
    candidates: ReadonlyArray<{ uid: string; rules: CardRules }>,
  ): { uid: string; rules: CardRules } {
    const lineCounts: Record<Line, number> = {
      front: 0,
      center: 0,
      rear: 0,
    };
    let combatantCount = 0;

    for (const u of view.self.units) {
      lineCounts[u.line] += 1;
      const uRules = this.catalog[u.cardId];
      if (uRules?.isCombatant !== false) {
        combatantCount += 1;
      }
    }

    const minLineCount = Math.min(lineCounts.front, lineCounts.center, lineCounts.rear);

    let best = candidates[0]!;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates) {
      const { rules } = candidate;
      const bonus = rules.abilities.reduce(
        (sum, a) =>
          sum +
          (a.kind === 'fury'
            ? a.amount
            : a.kind === 'discipline' &&
                view.self.units.some((u) => this.catalog[u.cardId]?.category === 'spearman')
              ? a.amount
              : 0),
        0,
      );
      const efficiency = calculateUnitEfficiency({
        ...rules,
        cost: effectiveCardCost(rules, view.self, view.rulesetVersion),
        atk: (rules.atk ?? 0) + bonus,
      });
      const line: Line = rules.line ?? 'front';
      const excessOnLine = lineCounts[line] - minLineCount;
      const lineBalanceAdjustment = -excessOnLine * 0.85;
      const combatantAdjustment = combatantCount === 0 && rules.isCombatant === false ? -2.0 : 0;

      const score = efficiency + lineBalanceAdjustment + combatantAdjustment;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  }

  protected choosePrebattle(view: Readonly<PlayerView>): ClientCommand {
    const { legal } = view.self;
    if (!legal.canLockInstants) {
      throw new Error(
        `${this.name} cannot lock instants for player ${view.me} when canLockInstants is false.`,
      );
    }

    return {
      type: 'LockInstants',
      cardUids: this.selectGreedyInstants(view),
    };
  }

  protected selectGreedyInstants(view: Readonly<PlayerView>): string[] {
    const { legal, hand, units, resources } = view.self;
    if (legal.playableInstantUids.length === 0) {
      return [];
    }

    let ownArchersCount = 0;
    let ownFrontUnitsCount = 0;
    let ownCombatantsCount = 0;
    const ownUnitCardIds: string[] = [];

    for (const u of units) {
      ownUnitCardIds.push(u.cardId);
      if (u.line === 'front') {
        ownFrontUnitsCount += 1;
      }
      const rules = this.catalog[u.cardId];
      if (rules?.category === 'archer') {
        ownArchersCount += 1;
      }
      if (rules?.isCombatant !== false) {
        ownCombatantsCount += 1;
      }
    }

    const ownTotalDem = calculateTotalDemForView(
      ownUnitCardIds,
      view.era,
      view.self.demBonus,
      this.catalog,
    );

    const fearsEnemyBreach = predictsEnemyBreach(view, this.catalog, 0);

    interface InstantCandidate {
      readonly uid: string;
      readonly rules: CardRules;
      readonly priority: number;
    }

    const desirableCandidates: InstantCandidate[] = [];

    for (const uid of legal.playableInstantUids) {
      const rules = lookupRulesByUid(hand, uid, this.catalog);
      if (rules?.type !== 'instant' || rules.effect === undefined) {
        continue;
      }

      const { effect } = rules;
      if (effect.kind === 'atk_mod') {
        if (effect.target === 'own_archers' && ownArchersCount >= 2) {
          desirableCandidates.push({
            uid,
            rules,
            priority: 20 + ownArchersCount * effect.amount,
          });
        } else if (
          (effect.target === 'own_front' && ownFrontUnitsCount >= 2) ||
          (effect.target === 'own_infantry' &&
            view.self.units.filter((u) => this.catalog[u.cardId]?.category === 'infantry').length >=
              2)
        ) {
          desirableCandidates.push({
            uid,
            rules,
            priority: 20 + ownFrontUnitsCount * effect.amount,
          });
        }
      } else if (effect.kind === 'walls_mod') {
        if (effect.target === 'own' && effect.amount > 0) {
          if (fearsEnemyBreach) {
            desirableCandidates.push({
              uid,
              rules,
              priority: 35,
            });
          }
        } else if (effect.target === 'enemy' && effect.amount < 0) {
          const wallReduction = Math.abs(effect.amount);
          const effectiveEnemyWalls = Math.max(0, view.opponent.walls - wallReduction);
          if (
            ownCombatantsCount > 0 &&
            ownTotalDem > 0 &&
            view.opponent.walls > 0 &&
            ownTotalDem >= effectiveEnemyWalls
          ) {
            desirableCandidates.push({
              uid,
              rules,
              priority: 30 + wallReduction,
            });
          }
        }
      }
    }

    desirableCandidates.sort((a, b) => b.priority - a.priority);

    const selectedUids: string[] = [];
    let currentCost: Resources = { ...ZERO_RESOURCES };
    let remainingEnemyWalls = view.opponent.walls;
    let currentExtraOwnWalls = 0;

    for (const candidate of desirableCandidates) {
      const { effect } = candidate.rules;
      if (effect?.kind === 'walls_mod' && effect.target === 'enemy' && remainingEnemyWalls <= 0) {
        continue;
      }
      if (
        effect?.kind === 'walls_mod' &&
        effect.target === 'own' &&
        !predictsEnemyBreach(view, this.catalog, currentExtraOwnWalls)
      ) {
        continue;
      }

      const nextCost = addResources(currentCost, candidate.rules.cost);
      if (canAfford(resources, nextCost)) {
        selectedUids.push(candidate.uid);
        currentCost = nextCost;
        if (effect?.kind === 'walls_mod') {
          if (effect.target === 'enemy') {
            remainingEnemyWalls = Math.max(0, remainingEnemyWalls + effect.amount);
          } else {
            currentExtraOwnWalls += effect.amount;
          }
        }
      }
    }

    return selectedUids;
  }
}

/**
 * Implementazione di `RationalBot` (TECH-SPEC §7.1):
 * Estende `GreedyBot` spendendo Cibo e Legno residui prima della battaglia quando prevede di subire una breccia,
 * così da negare il bottino di Razzia (max 1 Cibo e 1 Legno) all'avversario.
 */
export class RationalBot extends GreedyBot {
  public constructor(optionsOrCatalog?: RationalBotOptions | Readonly<Record<string, CardRules>>) {
    const resolved = resolveBotOptions(optionsOrCatalog, 'RationalBot');
    super({
      name: resolved.name,
      catalog: resolved.catalog,
    });
  }

  protected override chooseDevelopment(view: Readonly<PlayerView>): ClientCommand {
    const { legal, hand, resources } = view.self;
    const hasRaidableResources = resources.food > 0 || resources.wood > 0;
    const fearsBreach = predictsEnemyBreach(view, this.catalog, 0);

    const baseCommand = super.chooseDevelopment(view);

    if (!fearsBreach || !hasRaidableResources) {
      return baseCommand;
    }

    // Se GreedyBot ha scelto una carta da campo che già consuma Cibo o Legno,
    // seleziona tra le carte dello stesso tipo quella che massimizza il consumo di Cibo/Legno residui.
    if (baseCommand.type === 'PlayCard') {
      const cardRules = lookupRulesByUid(hand, baseCommand.cardUid, this.catalog);
      if (cardRules !== undefined && cardRules.cost.food + cardRules.cost.wood > 0) {
        const sameTypeCandidates: Array<{ uid: string; rules: CardRules }> = [];
        for (const uid of legal.playableFieldCardUids) {
          const rules = lookupRulesByUid(hand, uid, this.catalog);
          if (
            rules !== undefined &&
            rules.type === cardRules.type &&
            rules.cost.food + rules.cost.wood > 0
          ) {
            sameTypeCandidates.push({ uid, rules });
          }
        }
        const bestSpendMove = this.pickBestRaidDenialFieldCard(view, sameTypeCandidates);
        return {
          type: 'PlayCard',
          cardUid: bestSpendMove.uid,
        };
      }
    }

    // Se GreedyBot avrebbe passato (es. Edificio in Era III Ciclo 3) o giocato Gilda dei Mercanti,
    // spende attivamente Cibo e Legno residui giocando qualsiasi carta da campo legale che li consumi.
    const raidDenialFieldCandidates: Array<{ uid: string; rules: CardRules }> = [];
    for (const uid of legal.playableFieldCardUids) {
      const rules = lookupRulesByUid(hand, uid, this.catalog);
      if (rules !== undefined && rules.cost.food + rules.cost.wood > 0) {
        raidDenialFieldCandidates.push({ uid, rules });
      }
    }

    if (raidDenialFieldCandidates.length > 0) {
      const chosen = this.pickBestRaidDenialFieldCard(view, raidDenialFieldCandidates);
      return {
        type: 'PlayCard',
        cardUid: chosen.uid,
      };
    }

    return baseCommand;
  }

  private pickBestRaidDenialFieldCard(
    view: Readonly<PlayerView>,
    candidates: ReadonlyArray<{ uid: string; rules: CardRules }>,
  ): { uid: string; rules: CardRules } {
    const { resources } = view.self;
    let best = candidates[0]!;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates) {
      const { rules } = candidate;
      const cost = effectiveCardCost(rules, view.self, view.rulesetVersion);
      const foodSpent = Math.min(resources.food, cost.food);
      const woodSpent = Math.min(resources.wood, cost.wood);
      const emptiesFoodBonus = resources.food > 0 && resources.food - cost.food === 0 ? 3 : 0;
      const emptiesWoodBonus = resources.wood > 0 && resources.wood - cost.wood === 0 ? 3 : 0;
      const baseEfficiency =
        rules.type === 'unit' ? calculateUnitEfficiency({ ...rules, cost }) : 1;

      const score =
        (foodSpent + woodSpent) * 4 + emptiesFoodBonus + emptiesWoodBonus + baseEfficiency;

      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  }

  protected override choosePrebattle(view: Readonly<PlayerView>): ClientCommand {
    const { legal, hand, resources } = view.self;
    if (!legal.canLockInstants) {
      throw new Error(
        `${this.name} cannot lock instants for player ${view.me} when canLockInstants is false.`,
      );
    }

    const baseUids = this.selectGreedyInstants(view);
    if (legal.playableInstantUids.length === 0) {
      return { type: 'LockInstants', cardUids: baseUids };
    }

    let currentCost: Resources = { ...ZERO_RESOURCES };
    let extraOwnWalls = 0;

    for (const uid of baseUids) {
      const rules = lookupRulesByUid(hand, uid, this.catalog);
      if (rules !== undefined) {
        currentCost = addResources(currentCost, rules.cost);
        if (rules.effect?.kind === 'walls_mod' && rules.effect.target === 'own') {
          extraOwnWalls += rules.effect.amount;
        }
      }
    }

    const remainingFood = resources.food - currentCost.food;
    const remainingWood = resources.wood - currentCost.wood;

    if (
      (remainingFood > 0 || remainingWood > 0) &&
      predictsEnemyBreach(view, this.catalog, extraOwnWalls)
    ) {
      const selectedSet = new Set<string>(baseUids);
      const extraCandidates: Array<{ uid: string; rules: CardRules }> = [];
      for (const uid of legal.playableInstantUids) {
        if (selectedSet.has(uid)) {
          continue;
        }
        const rules = lookupRulesByUid(hand, uid, this.catalog);
        if (rules !== undefined && rules.cost.food + rules.cost.wood > 0) {
          extraCandidates.push({ uid, rules });
        }
      }

      extraCandidates.sort((a, b) => {
        const spendA = a.rules.cost.food + a.rules.cost.wood;
        const spendB = b.rules.cost.food + b.rules.cost.wood;
        return spendB - spendA;
      });

      const finalUids = [...baseUids];
      for (const candidate of extraCandidates) {
        const curRemFood = resources.food - currentCost.food;
        const curRemWood = resources.wood - currentCost.wood;
        const spendsRemainingRaidable =
          (curRemFood > 0 && candidate.rules.cost.food > 0) ||
          (curRemWood > 0 && candidate.rules.cost.wood > 0);
        if (!spendsRemainingRaidable) {
          continue;
        }

        const nextCost = addResources(currentCost, candidate.rules.cost);
        if (canAfford(resources, nextCost)) {
          finalUids.push(candidate.uid);
          currentCost = nextCost;
        }
      }

      return {
        type: 'LockInstants',
        cardUids: finalUids,
      };
    }

    return {
      type: 'LockInstants',
      cardUids: baseUids,
    };
  }
}
