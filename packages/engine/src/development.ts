// GDD §2.3, §3.3.3–7, §3.4, §4.1, §5.1, TECH-SPEC §4.4, §4.5, §4.7.1, §11 D5, D6, R1, R4, Appendice A TV-15..TV-20
// Gestione di SubmitDiscard in hand_limit e macchina a stati completa di development
// (PlayCard, PlayConversion, Pass, avanzamento cicli, rendite periodiche e ingresso in prebattle).

import { produce } from 'immer';
import type {
  PassCommand,
  PlayCardCommand,
  PlayConversionCommand,
  Result,
  RuleError,
  SubmitDiscardCommand,
} from './commands.js';
import { HAND_LIMIT } from './discard-policy.js';
import {
  PLAYERS_ORDER,
  applyPeriodicRent,
  canAfford,
  cloneResources,
  creditPlayerResources,
  getLogisticsCap,
  scaleResources,
  spendPlayerResources,
} from './economy.js';
import type { GameEvent, PassReason } from './events.js';
import { legalCommands } from './legal.js';
import {
  ERA_BASE_WALLS,
  ERA_CITY_MAX,
  ERA_DRAW_COUNT,
  drawCardsFromSubdeck,
  getOpponent,
  startEraDevelopment,
} from './setup.js';
import type {
  CardInstance,
  CardRules,
  EraNo,
  GameState,
  PlayerId,
  PlayerState,
  Resources,
  UnitInstance,
} from './types.js';

/**
 * Restituisce il giocatore con iniziativa nell'Era specificata (GDD §3.2, TV-20):
 * P1 agisce per primo in Era I ed Era III; P2 agisce per primo in Era II.
 */
export function getInitiativeForEra(era: EraNo): PlayerId {
  return era === 2 ? 'P2' : 'P1';
}

/**
 * Calcola la DEM effettiva di una singola unità comprensiva del `demBonus` del proprietario
 * (GDD §3.4, TECH-SPEC §4.8 riga 352, §11.2 R4, TV-16).
 */
export function getEffectiveUnitDem(
  unit: Readonly<UnitInstance>,
  ownerState: Readonly<PlayerState>,
  catalog: Readonly<Record<string, CardRules>>,
): number {
  const rules = catalog[unit.cardId];
  if (rules === undefined) {
    throw new Error(
      `Card "${unit.cardId}" (uid "${unit.uid}") not found in catalog during DEM calculation.`,
    );
  }
  return (rules.dem ?? 0) + ownerState.demBonus;
}

/**
 * Calcola la somma della DEM effettiva (`D`) su tutte le unità superstiti (`hp > 0`) del giocatore
 * (combattenti + unità d'Assedio — GDD §5.3 Fase 4, R4, TV-16).
 */
export function calculateTotalEffectiveDem(
  ownerState: Readonly<PlayerState>,
  catalog: Readonly<Record<string, CardRules>>,
): number {
  let totalDem = 0;
  for (const unit of ownerState.units) {
    if (unit.hp > 0) {
      totalDem += getEffectiveUnitDem(unit, ownerState, catalog);
    }
  }
  return totalDem;
}

/**
 * Se `rules.autoPassWhenNoLegalPlay` è attivo (D6), fa passare automaticamente con
 * `reason: 'no_legal_play'` il giocatore di turno finché il giocatore attivo non ha alcuna
 * carta legalmente giocabile in `development`.
 */
export function autoPassIfConfigured(
  draft: GameState,
  events: GameEvent[],
): void {
  if (!draft.rules.autoPassWhenNoLegalPlay) {
    return;
  }

  while (draft.phase === 'development' && draft.toAct !== null) {
    const activePlayer = draft.toAct;
    const legal = legalCommands(draft, activePlayer);
    const hasPlayableCard =
      legal.playableFieldCardUids.length > 0 ||
      legal.playableConversionUids.length > 0;
    if (hasPlayableCard) {
      break;
    }
    executePassInternal(draft, events, activePlayer, 'no_legal_play');
  }
}

/**
 * Entra in `hand_limit` se almeno un giocatore supera le 10 carte in mano dopo la pesca d'apertura d'Era;
 * altrimenti esegue direttamente il Raccolto d'apertura e apre il Ciclo 1 di `development` (TECH-SPEC §4.4 passi 5–7).
 */
export function enterEraHandLimitOrDevelopment(
  draft: GameState,
  events: GameEvent[],
): void {
  const p1Exceeds = draft.players.P1.hand.length > HAND_LIMIT;
  const p2Exceeds = draft.players.P2.hand.length > HAND_LIMIT;

  if (p1Exceeds || p2Exceeds) {
    draft.phase = 'hand_limit';
    draft.cycle = 0;
    draft.toAct = null;
    draft.pending = {};
    return;
  }

  startEraDevelopment(draft, events);
  autoPassIfConfigured(draft, events);
}

/**
 * Avvia la nuova Era (Era II o Era III): aggiorna Mura, Centro Città, iniziativa e contatori d'Era,
 * pesca 5 carte per ciascun giocatore ed entra in `hand_limit` o `development` (GDD §2.2, §6, TECH-SPEC §4.4, §4.9).
 */
export function startNextEra(
  draft: GameState,
  events: GameEvent[],
  nextEra: 2 | 3,
): void {
  draft.era = nextEra;
  draft.initiative = getInitiativeForEra(nextEra);
  draft.cycle = 0;
  draft.toAct = null;
  draft.pending = {};

  for (const player of PLAYERS_ORDER) {
    const p = draft.players[player];
    p.slotsUsed = 0;
    p.passed = false;
    p.demBonus = 0;
    p.walls = ERA_BASE_WALLS[nextEra] + Math.floor(p.walls / 2);
    p.cityMax = ERA_CITY_MAX[nextEra];
  }

  events.push({
    n: ++draft.counters.event,
    type: 'InitiativeAssigned',
    era: nextEra,
    initiative: draft.initiative,
  });

  events.push({
    n: ++draft.counters.event,
    type: 'EraStarted',
    era: nextEra,
    initiative: draft.initiative,
    walls: {
      P1: draft.players.P1.walls,
      P2: draft.players.P2.walls,
    },
    cityHp: {
      P1: draft.players.P1.cityMax - draft.players.P1.cityDamage,
      P2: draft.players.P2.cityMax - draft.players.P2.cityDamage,
    },
    cityMax: {
      P1: draft.players.P1.cityMax,
      P2: draft.players.P2.cityMax,
    },
  });

  for (const player of PLAYERS_ORDER) {
    drawCardsFromSubdeck(draft, events, player, nextEra, ERA_DRAW_COUNT[nextEra]);
  }

  enterEraHandLimitOrDevelopment(draft, events);
}

/**
 * Chiude la Fase di Sviluppo, rivela tutte le unità schierate ed entra in `prebattle` (TECH-SPEC §4.7.1, §11.2 R1).
 */
export function enterPrebattle(draft: GameState, events: GameEvent[]): void {
  draft.phase = 'prebattle';
  draft.toAct = null;
  draft.pending = {};

  events.push({
    n: ++draft.counters.event,
    type: 'DevelopmentEnded',
    era: draft.era,
  });

  for (const player of PLAYERS_ORDER) {
    for (const unit of draft.players[player].units) {
      if (draft.rules.seqAssignedAt === 'reveal' && unit.seq === 0) {
        unit.seq = ++draft.counters.seq;
      }
      unit.revealed = true;
    }
  }

  events.push({
    n: ++draft.counters.event,
    type: 'UnitsRevealed',
    era: draft.era,
    units: {
      P1: draft.players.P1.units.map((u) => ({ ...u })),
      P2: draft.players.P2.units.map((u) => ({ ...u })),
    },
    resources: {
      P1: cloneResources(draft.players.P1.resources),
      P2: cloneResources(draft.players.P2.resources),
    },
  });
}

/**
 * Avanza il turno all'interno del ciclo corrente o apre il ciclo successivo in `development`
 * dopo l'azione (`PlayCard`, `PlayConversion` o `Pass`) di `actor`.
 */
export function advanceDevelopmentTurn(
  draft: GameState,
  events: GameEvent[],
  actor: PlayerId,
): void {
  const first = draft.initiative;
  const second = getOpponent(first);

  // Se il primo giocatore di iniziativa ha appena agito e il secondo non ha passato, tocca al secondo nello stesso ciclo
  if (actor === first && !draft.players[second].passed) {
    draft.toAct = second;
    return;
  }

  // Il ciclo corrente è concluso: verifica se entrambi i giocatori hanno passato (TV-19)
  if (draft.players.P1.passed && draft.players.P2.passed) {
    enterPrebattle(draft, events);
    return;
  }

  // Almeno un giocatore non ha passato: apri il ciclo successivo
  draft.cycle += 1;

  // Rendite periodiche all'apertura dei Cicli 2 e 3 per ENTRAMBI i giocatori (GDD §3.3.4, §3.3.6, TV-19b)
  if (draft.cycle === 2 || draft.cycle === 3) {
    applyPeriodicRent(draft, events);
  }

  draft.toAct = !draft.players[first].passed ? first : second;

  events.push({
    n: ++draft.counters.event,
    type: 'CycleStarted',
    era: draft.era,
    cycle: draft.cycle,
    toAct: draft.toAct,
  });
}

/**
 * Valida in modo puro il comando `SubmitDiscard` in fase `hand_limit`.
 */
export function validateSubmitDiscard(
  state: Readonly<GameState>,
  cmd: SubmitDiscardCommand,
): RuleError | null {
  if (state.phase !== 'hand_limit') {
    return {
      code: 'INVALID_PHASE',
      message: `Cannot submit discard in phase "${state.phase}" (expected "hand_limit").`,
    };
  }

  const playerState = state.players[cmd.player];
  if (state.pending[cmd.player] !== undefined) {
    return {
      code: 'DECISION_ALREADY_LOCKED',
      message: `Player ${cmd.player} has already locked their hand_limit discard decision.`,
    };
  }

  const excess = playerState.hand.length - HAND_LIMIT;
  if (excess <= 0 || cmd.cardUids.length !== excess) {
    return {
      code: 'INVALID_DISCARD_COUNT',
      message: `Player ${cmd.player} must discard exactly ${Math.max(0, excess)} cards to reach hand limit ${HAND_LIMIT}, got ${cmd.cardUids.length}.`,
    };
  }

  const handUids = new Set(playerState.hand.map((c) => c.uid));
  const seenUids = new Set<string>();
  for (const uid of cmd.cardUids) {
    if (seenUids.has(uid) || !handUids.has(uid)) {
      return {
        code: 'CARD_NOT_IN_HAND',
        message: `Card "${uid}" is not a distinct card in ${cmd.player}'s hand.`,
      };
    }
    seenUids.add(uid);
  }

  return null;
}

/**
 * Applica in-place su un draft `GameState` il comando `SubmitDiscard`.
 * Quando tutti i giocatori con `hand.length > 10` hanno confermato, rimuove le carte scartate,
 * emette `HandLimitDiscarded` e avvia il Raccolto d'apertura + Ciclo 1 di `development`.
 */
export function mutateSubmitDiscard(
  draft: GameState,
  cmd: SubmitDiscardCommand,
  events: GameEvent[],
): Result<void, RuleError> {
  const validationError = validateSubmitDiscard(draft, cmd);
  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  draft.pending[cmd.player] = {
    window: 'hand_limit',
    cardUids: cmd.cardUids.slice(),
  };

  events.push({
    n: ++draft.counters.event,
    type: 'PlayerCommitted',
    player: cmd.player,
    window: 'hand_limit',
  });

  const allReady = PLAYERS_ORDER.every((p) => {
    const needsDiscard = draft.players[p].hand.length > HAND_LIMIT;
    return !needsDiscard || draft.pending[p] !== undefined;
  });

  if (allReady) {
    for (const player of PLAYERS_ORDER) {
      const commit = draft.pending[player];
      if (commit === undefined) {
        continue;
      }

      const playerState = draft.players[player];
      const handByUid = new Map(playerState.hand.map((c) => [c.uid, c]));
      const discardSet = new Set(commit.cardUids);
      const discardedCards: CardInstance[] = commit.cardUids.map(
        (uid) => handByUid.get(uid)!,
      );
      const keptCards = playerState.hand.filter((c) => !discardSet.has(c.uid));

      playerState.hand = keptCards;
      playerState.discard.push(...discardedCards);
      if (draft.rules.discardVisibility === 'public') {
        playerState.publicDiscard.push(...discardedCards.map((c) => c.cardId));
      }

      events.push({
        n: ++draft.counters.event,
        type: 'HandLimitDiscarded',
        player,
        count: discardedCards.length,
        cardUids: discardedCards.map((c) => c.uid),
      });
    }

    draft.pending = {};
    startEraDevelopment(draft, events);
    autoPassIfConfigured(draft, events);
  }

  return { ok: true, value: undefined };
}

/**
 * Funzione pura e immutabile per gestire `SubmitDiscard` in `hand_limit`.
 */
export function submitDiscard(
  state: GameState,
  cmd: SubmitDiscardCommand,
): Result<{ state: GameState; events: GameEvent[] }, RuleError> {
  const validationError = validateSubmitDiscard(state, cmd);
  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  const events: GameEvent[] = [];
  const nextState = produce(state, (draft) => {
    draft.players[cmd.player].consecutiveTimeouts = 0;
    mutateSubmitDiscard(draft, cmd, events);
    draft.stateVersion += 1;
  });

  return {
    ok: true,
    value: {
      state: nextState,
      events,
    },
  };
}

/**
 * Valida in modo puro il comando `PlayCard` in fase `development`.
 */
export function validatePlayCard(
  state: Readonly<GameState>,
  cmd: PlayCardCommand,
): RuleError | null {
  if (state.phase !== 'development') {
    return {
      code: 'INVALID_PHASE',
      message: `Cannot play field card in phase "${state.phase}" (expected "development").`,
    };
  }

  const playerState = state.players[cmd.player];
  if (playerState.passed) {
    return {
      code: 'ALREADY_PASSED',
      message: `Player ${cmd.player} has already passed in Era ${state.era}.`,
    };
  }

  if (state.toAct !== cmd.player) {
    return {
      code: 'NOT_YOUR_TURN',
      message: `It is not ${cmd.player}'s turn to act in cycle ${state.cycle}.`,
    };
  }

  const cardInHand = playerState.hand.find((c) => c.uid === cmd.cardUid);
  if (cardInHand === undefined) {
    return {
      code: 'CARD_NOT_IN_HAND',
      message: `Card "${cmd.cardUid}" is not in ${cmd.player}'s hand.`,
    };
  }

  const rules = state.catalog[cardInHand.cardId];
  if (
    rules === undefined ||
    (rules.type !== 'economy' && rules.type !== 'unit')
  ) {
    return {
      code: 'INVALID_PHASE',
      message: `Card "${cardInHand.cardId}" cannot be played via PlayCard in development.`,
    };
  }

  const logisticsCap = getLogisticsCap(state.era);
  if (playerState.slotsUsed >= logisticsCap) {
    return {
      code: 'NO_LOGISTICS_SLOT',
      message: `Player ${cmd.player} has used all ${logisticsCap} logistics slots in Era ${state.era}.`,
    };
  }

  if (!canAfford(playerState.resources, rules.cost)) {
    return {
      code: 'INSUFFICIENT_RESOURCES',
      message: `Player ${cmd.player} cannot afford card "${cardInHand.cardId}".`,
    };
  }

  return null;
}

/**
 * Applica in-place su un draft `GameState` il comando `PlayCard` (`economy` o `unit`).
 */
export function mutatePlayCard(
  draft: GameState,
  cmd: PlayCardCommand,
  events: GameEvent[],
): Result<void, RuleError> {
  const validationError = validatePlayCard(draft, cmd);
  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  const playerState = draft.players[cmd.player];
  const cardIndex = playerState.hand.findIndex((c) => c.uid === cmd.cardUid);
  const [card] = playerState.hand.splice(cardIndex, 1);
  const cardInstance = card!;
  const rules = draft.catalog[cardInstance.cardId]!;

  spendPlayerResources(draft, events, cmd.player, rules.cost);
  playerState.slotsUsed += 1;

  if (rules.type === 'economy') {
    playerState.buildings.push(cardInstance);
  } else {
    const unitInstance: UnitInstance = {
      uid: cardInstance.uid,
      cardId: cardInstance.cardId,
      owner: cardInstance.owner,
      drawnOrder: cardInstance.drawnOrder,
      seq: draft.rules.seqAssignedAt === 'play' ? ++draft.counters.seq : 0,
      hp: rules.hp!,
      line: rules.line!,
      atkMod: 0,
      revealed: false,
    };
    playerState.units.push(unitInstance);
  }

  const coveredCount =
    playerState.units.length + playerState.buildings.length;
  const cardType: 'economy' | 'unit' =
    rules.type === 'economy' ? 'economy' : 'unit';

  events.push({
    n: ++draft.counters.event,
    type: 'CardPlayed',
    player: cmd.player,
    slotsUsed: playerState.slotsUsed,
    coveredCount,
    uid: cardInstance.uid,
    cardId: cardInstance.cardId,
    cardType,
  });

  advanceDevelopmentTurn(draft, events, cmd.player);
  autoPassIfConfigured(draft, events);

  return { ok: true, value: undefined };
}

/**
 * Funzione pura e immutabile per gestire `PlayCard` in `development`.
 */
export function playCard(
  state: GameState,
  cmd: PlayCardCommand,
): Result<{ state: GameState; events: GameEvent[] }, RuleError> {
  const validationError = validatePlayCard(state, cmd);
  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  const events: GameEvent[] = [];
  const nextState = produce(state, (draft) => {
    draft.players[cmd.player].consecutiveTimeouts = 0;
    mutatePlayCard(draft, cmd, events);
    draft.stateVersion += 1;
  });

  return {
    ok: true,
    value: {
      state: nextState,
      events,
    },
  };
}

/**
 * Valida in modo puro il comando `PlayConversion` in fase `development` di Era III.
 */
export function validatePlayConversion(
  state: Readonly<GameState>,
  cmd: PlayConversionCommand,
): RuleError | null {
  if (state.phase !== 'development' || state.era !== 3) {
    return {
      code: 'INVALID_PHASE',
      message: `Conversions can only be played during Era III development (current phase="${state.phase}", era=${state.era}).`,
    };
  }

  const playerState = state.players[cmd.player];
  if (playerState.passed) {
    return {
      code: 'ALREADY_PASSED',
      message: `Player ${cmd.player} has already passed in Era ${state.era}.`,
    };
  }

  if (state.toAct !== cmd.player) {
    return {
      code: 'NOT_YOUR_TURN',
      message: `It is not ${cmd.player}'s turn to act in cycle ${state.cycle}.`,
    };
  }

  const cardInHand = playerState.hand.find((c) => c.uid === cmd.cardUid);
  if (cardInHand === undefined) {
    return {
      code: 'CARD_NOT_IN_HAND',
      message: `Card "${cmd.cardUid}" is not in ${cmd.player}'s hand.`,
    };
  }

  const rules = state.catalog[cardInHand.cardId];
  if (rules === undefined || rules.type !== 'conversion') {
    return {
      code: 'INVALID_PHASE',
      message: `Card "${cardInHand.cardId}" is not a conversion card.`,
    };
  }

  const buildingInField = playerState.buildings.find(
    (b) => b.uid === cmd.sacrificeUid,
  );
  if (buildingInField === undefined) {
    return {
      code: 'NO_BUILDING_TO_SACRIFICE',
      message: `Building "${cmd.sacrificeUid}" is not an active building of ${cmd.player}.`,
    };
  }

  if (!canAfford(playerState.resources, rules.cost)) {
    return {
      code: 'INSUFFICIENT_RESOURCES',
      message: `Player ${cmd.player} cannot afford conversion "${cardInHand.cardId}".`,
    };
  }

  return null;
}

/**
 * Applica in-place su un draft `GameState` il comando `PlayConversion` (Gilda dei Mercanti / Altoforno Reale).
 */
export function mutatePlayConversion(
  draft: GameState,
  cmd: PlayConversionCommand,
  events: GameEvent[],
): Result<void, RuleError> {
  const validationError = validatePlayConversion(draft, cmd);
  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  const playerState = draft.players[cmd.player];
  const cardIdx = playerState.hand.findIndex((c) => c.uid === cmd.cardUid);
  const [conversionCardRaw] = playerState.hand.splice(cardIdx, 1);
  const conversionCard = conversionCardRaw!;
  const rules = draft.catalog[conversionCard.cardId]!;

  // 1. Paga il costo della Riconversione
  spendPlayerResources(draft, events, cmd.player, rules.cost);

  // 2. Calcola N edifici attivi PRIMA del sacrificio (GDD §3.4, TV-15)
  const preSacrificeBuildingCount = playerState.buildings.length;

  // 3. Rimuovi l'edificio sacrificato e sposta edificio + carta Riconversione in discard
  const buildingIdx = playerState.buildings.findIndex(
    (b) => b.uid === cmd.sacrificeUid,
  );
  const [sacrificedRaw] = playerState.buildings.splice(buildingIdx, 1);
  const sacrificedBuilding = sacrificedRaw!;

  playerState.discard.push(sacrificedBuilding, conversionCard);
  if (draft.rules.sacrificeVisibility === 'public') {
    playerState.publicDiscard.push(sacrificedBuilding.cardId);
  }
  // La carta Riconversione è sempre pubblica al momento dell'attivazione (GDD §4.2, TECH-SPEC §5.3)
  playerState.publicDiscard.push(conversionCard.cardId);

  // 4. Calcola risorse guadagnate ed eventuale demBonus (R4, TV-15, TV-16)
  let gain: Resources = { food: 0, wood: 0, metal: 0 };
  let demBonusGained = 0;

  if (rules.effect?.kind === 'gain_per_building') {
    gain = scaleResources(
      rules.effect.perBuilding,
      preSacrificeBuildingCount,
    );
  } else if (rules.effect?.kind === 'gain_and_dem_bonus') {
    gain = cloneResources(rules.effect.gain);
    demBonusGained = rules.effect.demBonus;
    playerState.demBonus += demBonusGained;
  }

  creditPlayerResources(draft, events, cmd.player, gain, 'conversion');

  const coveredCount =
    playerState.units.length + playerState.buildings.length;

  events.push({
    n: ++draft.counters.event,
    type: 'ConversionActivated',
    player: cmd.player,
    uid: conversionCard.uid,
    cardId: conversionCard.cardId,
    gain: cloneResources(gain),
    demBonusGained,
    coveredCount,
    sacrificeUid: sacrificedBuilding.uid,
    sacrificeCardId: sacrificedBuilding.cardId,
  });

  advanceDevelopmentTurn(draft, events, cmd.player);
  autoPassIfConfigured(draft, events);

  return { ok: true, value: undefined };
}

/**
 * Funzione pura e immutabile per gestire `PlayConversion` in `development` di Era III.
 */
export function playConversion(
  state: GameState,
  cmd: PlayConversionCommand,
): Result<{ state: GameState; events: GameEvent[] }, RuleError> {
  const validationError = validatePlayConversion(state, cmd);
  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  const events: GameEvent[] = [];
  const nextState = produce(state, (draft) => {
    draft.players[cmd.player].consecutiveTimeouts = 0;
    mutatePlayConversion(draft, cmd, events);
    draft.stateVersion += 1;
  });

  return {
    ok: true,
    value: {
      state: nextState,
      events,
    },
  };
}

/**
 * Valida in modo puro il comando `Pass` in fase `development`.
 */
export function validatePass(
  state: Readonly<GameState>,
  cmd: PassCommand,
): RuleError | null {
  if (state.phase !== 'development') {
    return {
      code: 'INVALID_PHASE',
      message: `Cannot pass in phase "${state.phase}" (expected "development").`,
    };
  }

  const playerState = state.players[cmd.player];
  if (playerState.passed) {
    return {
      code: 'ALREADY_PASSED',
      message: `Player ${cmd.player} has already passed in Era ${state.era}.`,
    };
  }

  if (state.toAct !== cmd.player) {
    return {
      code: 'NOT_YOUR_TURN',
      message: `It is not ${cmd.player}'s turn to act in cycle ${state.cycle}.`,
    };
  }

  return null;
}

function executePassInternal(
  draft: GameState,
  events: GameEvent[],
  player: PlayerId,
  reason: PassReason,
): void {
  draft.players[player].passed = true;

  events.push({
    n: ++draft.counters.event,
    type: 'PlayerPassed',
    player,
    era: draft.era,
    cycle: draft.cycle,
    reason,
  });

  advanceDevelopmentTurn(draft, events, player);
}

/**
 * Applica in-place su un draft `GameState` il comando `Pass`.
 */
export function mutatePass(
  draft: GameState,
  cmd: PassCommand,
  events: GameEvent[],
  reason: PassReason = 'chosen',
): Result<void, RuleError> {
  const validationError = validatePass(draft, cmd);
  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  executePassInternal(draft, events, cmd.player, reason);
  autoPassIfConfigured(draft, events);

  return { ok: true, value: undefined };
}

/**
 * Funzione pura e immutabile per gestire `Pass` in `development`.
 */
export function passTurn(
  state: GameState,
  cmd: PassCommand,
  reason: PassReason = 'chosen',
): Result<{ state: GameState; events: GameEvent[] }, RuleError> {
  const validationError = validatePass(state, cmd);
  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  const events: GameEvent[] = [];
  const nextState = produce(state, (draft) => {
    if (reason === 'chosen') {
      draft.players[cmd.player].consecutiveTimeouts = 0;
    }
    mutatePass(draft, cmd, events, reason);
    draft.stateVersion += 1;
  });

  return {
    ok: true,
    value: {
      state: nextState,
      events,
    },
  };
}
