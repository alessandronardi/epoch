// GDD §5.2–5.3, TECH-SPEC §4.8, §11 D1, D4, R2, R5, Appendice A TV-10..TV-13, TV-21, TV-22, TV-24
// Risoluzione deterministica della Battaglia Campale (Fasi 1, 2A, 2B, 3 e Guardia Pre-Fase).

import { PLAYERS_ORDER } from './economy.js';
import type {
  BattleOutcomeEvent,
  BattleOutcomeKind,
  BattlePhaseId,
  DamageAssignment,
  GameEvent,
} from './events.js';
import { getOpponent } from './setup.js';
import type {
  CardInstance,
  CardRules,
  GameState,
  Line,
  PlayerId,
  RulesConfig,
  UnitInstance,
} from './types.js';

export const STANDARD_LINE_PRIORITY: readonly Line[] = [
  'front',
  'center',
  'rear',
];

export const FLANK_LINE_PRIORITY: readonly Line[] = ['rear', 'front', 'center'];

export const MAX_MELEE_CYCLES = 6;

export interface BattleResult {
  kind: BattleOutcomeKind;
  winner?: PlayerId;
}

function getUnitRulesOrThrow(
  catalog: Readonly<Record<string, CardRules>>,
  unit: Readonly<UnitInstance>,
): CardRules {
  const rules = catalog[unit.cardId];
  if (rules === undefined) {
    throw new Error(
      `Card "${unit.cardId}" (uid "${unit.uid}") not found in catalog during battle resolution.`,
    );
  }
  return rules;
}

/**
 * Verifica se un'unità è combattente (`card.isCombatant === true`).
 * Le unità d'Assedio (`isCombatant === false`) sono sempre escluse dai combattenti e dai bersagli
 * nelle Fasi 1, 2A, 2B e 3 (GDD §5.2, TECH-SPEC §4.8).
 */
export function isCombatantUnit(
  unit: Readonly<UnitInstance>,
  catalog?: Readonly<Record<string, CardRules>>,
): boolean {
  if (catalog !== undefined) {
    const rules = getUnitRulesOrThrow(catalog, unit);
    return rules.isCombatant === true;
  }
  const maybeFlag = (unit as { isCombatant?: boolean }).isCombatant;
  if (typeof maybeFlag === 'boolean') {
    return maybeFlag;
  }
  return !unit.cardId.includes('_sig_');
}

/**
 * Calcola l'ATK effettivo di un'unità: `card.atk + unit.atkMod` (TECH-SPEC §4.8 riga 351).
 */
export function getEffectiveUnitAtk(
  unit: Readonly<UnitInstance>,
  catalog: Readonly<Record<string, CardRules>>,
): number {
  const rules = getUnitRulesOrThrow(catalog, unit);
  return (rules.atk ?? 0) + unit.atkMod;
}

/**
 * Calcola l'ATK in Mischia Generale (Fase 3) di un'unità combattente viva (GDD §5.3, TECH-SPEC §4.8, §11 D4, TV-24):
 * - Per gli Arcieri: `max(1, floor(effAtk / 2))` se `rules.archerMeleeUsesEffectiveAtk` è `true` (default D4),
 *   altrimenti `max(1, floor(baseAtk / 2)) + unit.atkMod`;
 * - Per tutte le altre unità combattenti: `effAtk`.
 */
export function getMeleeUnitAtk(
  unit: Readonly<UnitInstance>,
  catalog: Readonly<Record<string, CardRules>>,
  rulesConfig: Readonly<RulesConfig>,
): number {
  const rules = getUnitRulesOrThrow(catalog, unit);
  const baseAtk = rules.atk ?? 0;

  if (rules.category === 'archer') {
    if (rulesConfig.archerMeleeUsesEffectiveAtk) {
      const effAtk = baseAtk + unit.atkMod;
      return Math.max(1, Math.floor(effAtk / 2));
    }
    return Math.max(1, Math.floor(baseAtk / 2));
  }

  return baseAtk + unit.atkMod;
}

/**
 * Ordina le unità bersaglio nemiche per priorità di linea e, a parità di linea, per `seq` crescente (FIFO),
 * escludendo sempre le unità non combattenti (`isCombatant === false`) e le unità con `hp <= 0`
 * (GDD §5.2, TECH-SPEC §4.8 righe 379–388).
 */
export function orderTargets(
  units: readonly UnitInstance[],
  linePriority: readonly Line[] = STANDARD_LINE_PRIORITY,
  filter: (u: UnitInstance) => boolean = () => true,
  catalog?: Readonly<Record<string, CardRules>>,
): UnitInstance[] {
  return units
    .filter((u) => isCombatantUnit(u, catalog) && u.hp > 0 && filter(u))
    .slice()
    .sort(
      (a, b) =>
        linePriority.indexOf(a.line) - linePriority.indexOf(b.line) ||
        a.seq - b.seq,
    );
}

/**
 * Ripartisce il danno totale `totalDamage` sui bersagli ordinati `targets` con trasferimento
 * dell'eccesso al bersaglio successivo. L'eventuale danno residuo senza altri bersagli validi va perduto
 * (GDD §5.2, TECH-SPEC §4.8 righe 390–400, TV-10).
 */
export function assignDamage(
  totalDamage: number,
  targets: readonly UnitInstance[],
): DamageAssignment[] {
  let rest = totalDamage;
  const assignments: DamageAssignment[] = [];

  for (const t of targets) {
    if (rest <= 0) {
      break;
    }
    if (t.hp <= 0) {
      continue;
    }
    const d = Math.min(rest, t.hp);
    if (d > 0) {
      assignments.push({ uid: t.uid, damage: d });
      rest -= d;
    }
  }

  return assignments;
}

/**
 * Conta il numero di unità combattenti vive (`isCombatant === true` e `hp > 0`) di un giocatore.
 */
export function countLivingCombatants(
  units: readonly UnitInstance[],
  catalog: Readonly<Record<string, CardRules>>,
): number {
  let count = 0;
  for (const u of units) {
    if (u.hp > 0 && isCombatantUnit(u, catalog)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Valuta la Regola di Guardia Pre-Fase (GDD §5.2, TECH-SPEC §4.8 righe 356–369, §11.2 R5):
 * - se `c1 === 0 && c2 === 0` -> `{ kind: 'mutual_annihilation' }`
 * - se `c1 > 0 && c2 === 0` -> `{ kind: 'winner', winner: 'P1' }`
 * - se `c1 === 0 && c2 > 0` -> `{ kind: 'winner', winner: 'P2' }`
 * - altrimenti (`c1 > 0 && c2 > 0`):
 *   - se `afterFinalMeleeCycle === true` (dopo il 6° ciclo di Fase 3, R5) -> `{ kind: 'stalemate' }`
 *   - altrimenti `null` (la battaglia prosegue con la fase/ciclo).
 */
export function evaluateBattleGuard(
  state: Readonly<GameState>,
  afterFinalMeleeCycle = false,
): BattleResult | null {
  const c1 = countLivingCombatants(state.players.P1.units, state.catalog);
  const c2 = countLivingCombatants(state.players.P2.units, state.catalog);

  if (c1 === 0 && c2 === 0) {
    return { kind: 'mutual_annihilation' };
  }
  if (c1 > 0 && c2 === 0) {
    return { kind: 'winner', winner: 'P1' };
  }
  if (c1 === 0 && c2 > 0) {
    return { kind: 'winner', winner: 'P2' };
  }
  if (afterFinalMeleeCycle) {
    return { kind: 'stalemate' };
  }
  return null;
}

function createSnapshot(
  state: Readonly<GameState>,
): Record<PlayerId, UnitInstance[]> {
  return {
    P1: state.players.P1.units.filter((u) => u.hp > 0).map((u) => ({ ...u })),
    P2: state.players.P2.units.filter((u) => u.hp > 0).map((u) => ({ ...u })),
  };
}

function hasLivingCategory(
  snapshotUnits: readonly UnitInstance[],
  catalog: Readonly<Record<string, CardRules>>,
  category: CardRules['category'],
): boolean {
  return snapshotUnits.some(
    (u) => u.hp > 0 && getUnitRulesOrThrow(catalog, u).category === category,
  );
}

function getVolleyBonus(
  rules: Readonly<CardRules>,
  state: Readonly<GameState>,
): number {
  if (state.rules.eraScalingSource === 'current_era') {
    return state.era;
  }
  let bonus = 0;
  for (const ab of rules.abilities) {
    if (ab.kind === 'volley') {
      bonus += ab.bonusVsSpearman;
    }
  }
  return bonus;
}

function getImpaleDamage(
  rules: Readonly<CardRules>,
  state: Readonly<GameState>,
): number {
  if (state.rules.eraScalingSource === 'current_era') {
    return 1 + 2 * state.era;
  }
  let dmg = 0;
  for (const ab of rules.abilities) {
    if (ab.kind === 'impale') {
      dmg += ab.damage;
    }
  }
  return dmg;
}

function getFlankBonus(
  rules: Readonly<CardRules>,
  state: Readonly<GameState>,
): number {
  if (state.rules.eraScalingSource === 'current_era') {
    return state.era;
  }
  let bonus = 0;
  for (const ab of rules.abilities) {
    if (ab.kind === 'flank') {
      bonus += ab.bonusVsArcher;
    }
  }
  return bonus;
}

function applyDamageAndRemoveCasualties(
  state: GameState,
  assignments: Readonly<Record<PlayerId, DamageAssignment[]>>,
): Record<PlayerId, string[]> {
  // Passo 3: Applicazione simultanea dei danni calcolati dai due lati
  for (const attacker of PLAYERS_ORDER) {
    const defender = getOpponent(attacker);
    const defenderUnits = state.players[defender].units;

    for (const assignment of assignments[attacker]) {
      const target = defenderUnits.find((u) => u.uid === assignment.uid);
      if (target !== undefined) {
        target.hp -= assignment.damage;
      }
    }
  }

  // Passo 4: Rimozione simultanea delle unità con hp <= 0 verso discard e publicDiscard
  const casualties: Record<PlayerId, string[]> = {
    P1: [],
    P2: [],
  };

  for (const player of PLAYERS_ORDER) {
    const playerState = state.players[player];
    const surviving: UnitInstance[] = [];

    for (const unit of playerState.units) {
      if (unit.hp <= 0) {
        casualties[player].push(unit.uid);
        const discardedCard: CardInstance = {
          uid: unit.uid,
          cardId: unit.cardId,
          owner: unit.owner,
          drawnOrder: unit.drawnOrder,
        };
        playerState.discard.push(discardedCard);
        playerState.publicDiscard.push(unit.cardId);
      } else {
        surviving.push(unit);
      }
    }

    playerState.units = surviving;
  }

  return casualties;
}

function emitBattlePhaseEvent(
  state: GameState,
  events: GameEvent[],
  phase: BattlePhaseId,
  damageDealt: Record<PlayerId, number>,
  assignments: Record<PlayerId, DamageAssignment[]>,
  casualties: Record<PlayerId, string[]>,
  meleeCycle?: number,
): void {
  events.push({
    n: ++state.counters.event,
    type: 'BattlePhaseResolved',
    era: state.era,
    phase,
    ...(meleeCycle !== undefined ? { meleeCycle } : {}),
    damageDealt: {
      P1: damageDealt.P1,
      P2: damageDealt.P2,
    },
    assignments: {
      P1: assignments.P1.map((a) => ({ ...a })),
      P2: assignments.P2.map((a) => ({ ...a })),
    },
    casualties: {
      P1: casualties.P1.slice(),
      P2: casualties.P2.slice(),
    },
  });
}

function emitBattleOutcomeEvent(
  state: GameState,
  events: GameEvent[],
  outcome: BattleResult,
): BattleResult {
  const outcomeEvent: BattleOutcomeEvent = {
    n: ++state.counters.event,
    type: 'BattleOutcome',
    era: state.era,
    kind: outcome.kind,
    ...(outcome.winner !== undefined ? { winner: outcome.winner } : {}),
  };
  events.push(outcomeEvent);
  return outcome;
}

function executePhase1Volley(state: GameState, events: GameEvent[]): void {
  // 1. Snapshot
  const snapshot = createSnapshot(state);

  // 2. Calcolo
  const damageDealt: Record<PlayerId, number> = { P1: 0, P2: 0 };
  const assignments: Record<PlayerId, DamageAssignment[]> = { P1: [], P2: [] };

  for (const attacker of PLAYERS_ORDER) {
    const defender = getOpponent(attacker);
    const enemyHasSpearman = hasLivingCategory(
      snapshot[defender],
      state.catalog,
      'spearman',
    );

    let totalDmg = 0;
    for (const unit of snapshot[attacker]) {
      const rules = getUnitRulesOrThrow(state.catalog, unit);
      if (rules.category === 'archer') {
        const effAtk = getEffectiveUnitAtk(unit, state.catalog);
        const bonus = enemyHasSpearman ? getVolleyBonus(rules, state) : 0;
        totalDmg += effAtk + bonus;
      }
    }

    damageDealt[attacker] = totalDmg;
    const targets = orderTargets(
      snapshot[defender],
      STANDARD_LINE_PRIORITY,
      () => true,
      state.catalog,
    );
    assignments[attacker] = assignDamage(totalDmg, targets);
  }

  // 3. Applicazione Simultanea & 4. Rimozione
  const casualties = applyDamageAndRemoveCasualties(state, assignments);

  emitBattlePhaseEvent(
    state,
    events,
    'phase1_volley',
    damageDealt,
    assignments,
    casualties,
  );
}

function executePhase2AImpale(state: GameState, events: GameEvent[]): void {
  // 1. Snapshot post-Fase 1
  const snapshot = createSnapshot(state);

  // 2. Calcolo
  const damageDealt: Record<PlayerId, number> = { P1: 0, P2: 0 };
  const assignments: Record<PlayerId, DamageAssignment[]> = { P1: [], P2: [] };

  for (const attacker of PLAYERS_ORDER) {
    const defender = getOpponent(attacker);

    let totalDmg = 0;
    for (const unit of snapshot[attacker]) {
      const rules = getUnitRulesOrThrow(state.catalog, unit);
      if (rules.category === 'spearman') {
        totalDmg += getImpaleDamage(rules, state);
      }
    }

    damageDealt[attacker] = totalDmg;
    const cavalryTargets = orderTargets(
      snapshot[defender],
      STANDARD_LINE_PRIORITY,
      (u) => getUnitRulesOrThrow(state.catalog, u).category === 'cavalry',
      state.catalog,
    );
    assignments[attacker] = assignDamage(totalDmg, cavalryTargets);
  }

  // 3. Applicazione Simultanea & 4. Rimozione
  const casualties = applyDamageAndRemoveCasualties(state, assignments);

  emitBattlePhaseEvent(
    state,
    events,
    'phase2a_impale',
    damageDealt,
    assignments,
    casualties,
  );
}

function executePhase2BImpact(state: GameState, events: GameEvent[]): void {
  // 1. Snapshot post-Fase 2A
  const snapshot = createSnapshot(state);

  // 2. Calcolo
  const damageDealt: Record<PlayerId, number> = { P1: 0, P2: 0 };
  const assignments: Record<PlayerId, DamageAssignment[]> = { P1: [], P2: [] };

  for (const attacker of PLAYERS_ORDER) {
    const defender = getOpponent(attacker);
    const enemyHasSpearman = hasLivingCategory(
      snapshot[defender],
      state.catalog,
      'spearman',
    );
    const enemyHasArcher = hasLivingCategory(
      snapshot[defender],
      state.catalog,
      'archer',
    );

    const isFlanking = !enemyHasSpearman;
    const linePriority = isFlanking
      ? FLANK_LINE_PRIORITY
      : STANDARD_LINE_PRIORITY;

    let totalDmg = 0;
    for (const unit of snapshot[attacker]) {
      const rules = getUnitRulesOrThrow(state.catalog, unit);
      if (rules.category === 'cavalry') {
        const effAtk = getEffectiveUnitAtk(unit, state.catalog);
        const bonus =
          isFlanking && enemyHasArcher ? getFlankBonus(rules, state) : 0;
        totalDmg += effAtk + bonus;
      }
    }

    damageDealt[attacker] = totalDmg;
    const targets = orderTargets(
      snapshot[defender],
      linePriority,
      () => true,
      state.catalog,
    );
    assignments[attacker] = assignDamage(totalDmg, targets);
  }

  // 3. Applicazione Simultanea & 4. Rimozione
  const casualties = applyDamageAndRemoveCasualties(state, assignments);

  emitBattlePhaseEvent(
    state,
    events,
    'phase2b_impact',
    damageDealt,
    assignments,
    casualties,
  );
}

function executePhase3MeleeCycle(
  state: GameState,
  events: GameEvent[],
  meleeCycle: number,
): void {
  // 1. Snapshot all'inizio del ciclo di mischia
  const snapshot = createSnapshot(state);

  // 2. Calcolo
  const damageDealt: Record<PlayerId, number> = { P1: 0, P2: 0 };
  const assignments: Record<PlayerId, DamageAssignment[]> = { P1: [], P2: [] };

  for (const attacker of PLAYERS_ORDER) {
    const defender = getOpponent(attacker);

    let totalDmg = 0;
    for (const unit of snapshot[attacker]) {
      if (isCombatantUnit(unit, state.catalog)) {
        totalDmg += getMeleeUnitAtk(unit, state.catalog, state.rules);
      }
    }

    damageDealt[attacker] = totalDmg;
    const targets = orderTargets(
      snapshot[defender],
      STANDARD_LINE_PRIORITY,
      () => true,
      state.catalog,
    );
    assignments[attacker] = assignDamage(totalDmg, targets);
  }

  // 3. Applicazione Simultanea & 4. Rimozione
  const casualties = applyDamageAndRemoveCasualties(state, assignments);

  emitBattlePhaseEvent(
    state,
    events,
    'phase3_melee',
    damageDealt,
    assignments,
    casualties,
    meleeCycle,
  );
}

/**
 * Esegue l'intera Battaglia Campale deterministica (Fasi 1, 2A, 2B e fino a 6 cicli di Fase 3)
 * sullo stato/draft della partita, emettendo `BattleStarted`, i relativi `BattlePhaseResolved`
 * e il `BattleOutcome` conclusivo (GDD §5.2–5.3, TECH-SPEC §4.8, R5).
 */
export function resolveFieldBattle(
  state: GameState,
  events: GameEvent[],
): BattleResult {
  events.push({
    n: ++state.counters.event,
    type: 'BattleStarted',
    era: state.era,
  });

  // Guardia prima di Fase 1 (Tiro degli Arcieri)
  const guardPre1 = evaluateBattleGuard(state);
  if (guardPre1 !== null) {
    return emitBattleOutcomeEvent(state, events, guardPre1);
  }
  executePhase1Volley(state, events);

  // Guardia prima di Fase 2A (Impalamento)
  const guardPre2A = evaluateBattleGuard(state);
  if (guardPre2A !== null) {
    return emitBattleOutcomeEvent(state, events, guardPre2A);
  }
  executePhase2AImpale(state, events);

  // Guardia prima di Fase 2B (Impatto e Accerchiamento)
  const guardPre2B = evaluateBattleGuard(state);
  if (guardPre2B !== null) {
    return emitBattleOutcomeEvent(state, events, guardPre2B);
  }
  executePhase2BImpact(state, events);

  // Fase 3 (Mischia Generale, fino a 6 cicli)
  for (let cycle = 1; cycle <= MAX_MELEE_CYCLES; cycle++) {
    const guardPreCycle = evaluateBattleGuard(state);
    if (guardPreCycle !== null) {
      return emitBattleOutcomeEvent(state, events, guardPreCycle);
    }
    executePhase3MeleeCycle(state, events, cycle);
  }

  // Guardia dopo la rimozione dei caduti del 6° ciclo di Fase 3 (R5)
  const finalOutcome = evaluateBattleGuard(state, true)!;
  return emitBattleOutcomeEvent(state, events, finalOutcome);
}
