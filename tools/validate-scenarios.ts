// TECH-SPEC §7.3, Appendice A — Oracolo normativo: esecutore standalone degli scenari JSON dichiarativi.
// Carica tutti i file `data/scenarios/*.json`, li valida con Zod (`data/schema/scenario.schema.ts`),
// costruisce lo stato di partenza tramite `createGame` (fixedDecks + fixedInitiative), esegue la
// Pre-Battaglia e la battaglia sul motore tramite l'API pubblica (`apply`) e verifica esito campale,
// superstiti, HP Mura, danno al Centro Città, risorse, breccia, fine partita, determinismo e assenza di leak.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ERA_CITY_MAX,
  apply,
  createGame,
  getOpponent,
  playerView,
  projectEvent,
  stateHash,
  type CardInstance,
  type CardRules,
  type CardType,
  type Command,
  type EraNo,
  type GameEvent,
  type GameState,
  type PlayerId,
  type Resources,
  type UnitInstance,
} from '../packages/engine/src/index.js';
import { CardsRulesFileSchema } from '../packages/content/src/index.js';
import { DeckPayloadSchema } from '../data/schema/deck.schema.js';
import { ScenariosFileSchema, type ScenarioPayload } from '../data/schema/scenario.schema.js';

const PLAYERS: readonly PlayerId[] = ['P1', 'P2'];
const SCENARIO_SEED_PREFIX = 'scenario:';
const DEFAULT_DECK_FILE = 'balanced-tactical.json';

type FixedDecks = Record<PlayerId, Record<EraNo, string[]>>;
type PerPlayer<T> = Record<PlayerId, T>;

export interface ScenarioObservation {
  outcome: 'winner' | 'mutual_annihilation' | 'stalemate';
  winner: PlayerId | null;
  survivors: PerPlayer<string[]>;
  wallsAfter: PerPlayer<number>;
  cityDamageAfter: PerPlayer<number>;
  resourcesAfter: PerPlayer<Resources>;
  breach: boolean;
  gameEnded: { kind: string; winner: PlayerId | 'DRAW' } | null;
  finalStateHash: string;
}

export interface ScenarioRunResult {
  id: string;
  source: string;
  ok: boolean;
  failures: string[];
  observation: ScenarioObservation | null;
}

class ScenarioError extends Error {}

// ---------------------------------------------------------------------------
// Caricamento dati
// ---------------------------------------------------------------------------

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}

export function loadCatalog(rootDir: string): Record<string, CardRules> {
  const raw = readJson(path.join(rootDir, 'data', 'cards.rules.json'));
  return CardsRulesFileSchema.parse(raw) as unknown as Record<string, CardRules>;
}

export function loadFixedDecks(rootDir: string): FixedDecks {
  const deck = DeckPayloadSchema.parse(
    readJson(path.join(rootDir, 'data', 'decks', DEFAULT_DECK_FILE)),
  );
  const subdecks = (): Record<EraNo, string[]> => ({
    1: [...deck.subdecks['1']],
    2: [...deck.subdecks['2']],
    3: [...deck.subdecks['3']],
  });
  return { P1: subdecks(), P2: subdecks() };
}

export function loadScenarioFiles(
  scenariosDir: string,
): Array<{ source: string; scenarios: ScenarioPayload[] }> {
  if (!fs.existsSync(scenariosDir)) {
    throw new ScenarioError(`Scenario directory not found: ${scenariosDir}`);
  }
  const files = fs
    .readdirSync(scenariosDir)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .sort();

  return files.map((file) => {
    const source = path.join(scenariosDir, file);
    const parsed = ScenariosFileSchema.safeParse(readJson(source));
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `    - [${i.path.join('.')}] ${i.message}`)
        .join('\n');
      throw new ScenarioError(`Invalid scenario file ${file}:\n${issues}`);
    }
    const scenarios = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
    return { source: file, scenarios };
  });
}

// ---------------------------------------------------------------------------
// Costruzione dello stato di partenza
// ---------------------------------------------------------------------------

function requireCard(
  catalog: Record<string, CardRules>,
  cardId: string,
  allowed: readonly CardType[],
  context: string,
): CardRules {
  const rules = catalog[cardId];
  if (rules === undefined) {
    throw new ScenarioError(`${context}: unknown cardId "${cardId}".`);
  }
  if (!allowed.includes(rules.type)) {
    throw new ScenarioError(
      `${context}: card "${cardId}" has type "${rules.type}" (expected ${allowed.join(' | ')}).`,
    );
  }
  return rules;
}

function unwrap(state: GameState, cmd: Command): { state: GameState; events: GameEvent[] } {
  const res = apply(state, cmd);
  if (!res.ok) {
    throw new ScenarioError(
      `Engine rejected ${cmd.type} (${cmd.player}): ${res.error.code} — ${res.error.message}`,
    );
  }
  return res.value;
}

interface PreparedScenario {
  /** Eventi emessi da createGame e dai mulligan (proiettati per il controllo anti-leak). */
  bootstrapEvents: GameEvent[];
  /** Stato in `development`, Ciclo 1, con il setup dello scenario iniettato. */
  start: GameState;
  /** uid delle Istantanee iniettate in mano, nell'ordine dichiarato. */
  instantUids: PerPlayer<string[]>;
  /** uid di carte che non diventano mai pubbliche per l'avversario. */
  secretUids: PerPlayer<Set<string>>;
  /** uid delle unità schierate (coperte fino a `UnitsRevealed`). */
  unitUids: PerPlayer<string[]>;
}

function prepareScenario(
  scenario: ScenarioPayload,
  catalog: Record<string, CardRules>,
  fixedDecks: FixedDecks,
): PreparedScenario {
  const { state: s0, events: e0 } = createGame({
    seed: `${SCENARIO_SEED_PREFIX}${scenario.id}`,
    catalog: structuredClone(catalog),
    fixedDecks: structuredClone(fixedDecks),
    fixedInitiative: scenario.initiative,
  });
  const m1 = unwrap(s0, { type: 'SubmitMulligan', player: 'P1', cardUids: [] });
  const m2 = unwrap(m1.state, {
    type: 'SubmitMulligan',
    player: 'P2',
    cardUids: [],
  });

  if (m2.state.phase !== 'development') {
    throw new ScenarioError(`Bootstrap did not reach "development" (phase "${m2.state.phase}").`);
  }

  const state = structuredClone(m2.state);
  const secretUids: PerPlayer<Set<string>> = { P1: new Set(), P2: new Set() };
  const instantUids: PerPlayer<string[]> = { P1: [], P2: [] };
  const unitUids: PerPlayer<string[]> = { P1: [], P2: [] };

  // Le carte pescate in apertura e i sotto-mazzi restano segreti per l'avversario.
  for (const player of PLAYERS) {
    const ps = state.players[player];
    for (const c of ps.hand) secretUids[player].add(c.uid);
    for (const era of [1, 2, 3] as const) {
      for (const c of ps.subdecks[era]) secretUids[player].add(c.uid);
    }
  }

  state.era = scenario.era;
  state.cycle = 1;
  state.initiative = scenario.initiative;
  state.toAct = scenario.initiative;
  state.pending = {};

  let seq = state.counters.seq;
  let drawnOrder = state.counters.drawnOrder;

  for (const player of PLAYERS) {
    const setup = scenario.setup[player];
    const ps = state.players[player];
    const ctx = `${scenario.id} setup.${player}`;
    const mkCard = (cardId: string, tag: string, idx: number): CardInstance => ({
      uid: `sc-${player}-${tag}-${idx}`,
      cardId,
      owner: player,
      drawnOrder: ++drawnOrder,
    });

    ps.units = setup.units.map((cardId, idx): UnitInstance => {
      const rules = requireCard(catalog, cardId, ['unit'], `${ctx}.units[${idx}]`);
      if (rules.hp === undefined || rules.line === undefined) {
        throw new ScenarioError(`${ctx}: unit "${cardId}" lacks hp/line.`);
      }
      const card = mkCard(cardId, 'unit', idx);
      unitUids[player].push(card.uid);
      return {
        ...card,
        seq: ++seq,
        hp: rules.hp,
        line: rules.line,
        atkMod: 0,
        revealed: false,
      };
    });

    ps.buildings = (setup.buildings ?? []).map((cardId, idx) => {
      requireCard(catalog, cardId, ['economy'], `${ctx}.buildings[${idx}]`);
      const card = mkCard(cardId, 'bld', idx);
      secretUids[player].add(card.uid);
      return card;
    });

    const extraHand = (setup.hand ?? []).map((cardId, idx) => {
      requireCard(
        catalog,
        cardId,
        ['economy', 'unit', 'instant', 'conversion'],
        `${ctx}.hand[${idx}]`,
      );
      const card = mkCard(cardId, 'hand', idx);
      secretUids[player].add(card.uid);
      return card;
    });

    const instants = scenario.instants[player].map((cardId, idx) => {
      requireCard(catalog, cardId, ['instant'], `${scenario.id} instants.${player}[${idx}]`);
      const card = mkCard(cardId, 'inst', idx);
      instantUids[player].push(card.uid);
      return card;
    });

    ps.hand = [...extraHand, ...instants];
    if (setup.resources !== undefined) ps.resources = { ...setup.resources };
    ps.walls = setup.walls;
    ps.cityMax = ERA_CITY_MAX[scenario.era];
    ps.cityDamage = setup.cityDamage;
    ps.demBonus = setup.demBonus ?? 0;
    ps.slotsUsed = ps.units.length;
    ps.passed = false;
  }

  state.counters.seq = seq;
  state.counters.drawnOrder = drawnOrder;

  return {
    bootstrapEvents: [...e0, ...m1.events, ...m2.events],
    start: state,
    instantUids,
    secretUids,
    unitUids,
  };
}

// ---------------------------------------------------------------------------
// Esecuzione e osservazione
// ---------------------------------------------------------------------------

interface ExecutionTrace {
  states: GameState[];
  events: GameEvent[];
  battleEvents: GameEvent[];
  preBattle: GameState;
  final: GameState;
}

function execute(prepared: PreparedScenario): ExecutionTrace {
  const states: GameState[] = [prepared.start];
  const events: GameEvent[] = [];
  let state = prepared.start;

  const step = (cmd: Command): GameEvent[] => {
    const res = unwrap(state, cmd);
    state = res.state;
    states.push(state);
    events.push(...res.events);
    return res.events;
  };

  const first = prepared.start.initiative;
  const second = getOpponent(first);
  step({ type: 'Pass', player: first });
  step({ type: 'Pass', player: second });

  if (state.phase !== 'prebattle') {
    throw new ScenarioError(
      `Expected "prebattle" after both players passed, got "${state.phase}".`,
    );
  }
  const preBattle = state;

  step({ type: 'LockInstants', player: 'P1', cardUids: prepared.instantUids.P1 });
  const battleEvents = step({
    type: 'LockInstants',
    player: 'P2',
    cardUids: prepared.instantUids.P2,
  });

  return { states, events, battleEvents, preBattle, final: state };
}

function observe(trace: ExecutionTrace): ScenarioObservation {
  const pre = trace.preBattle;
  const walls: PerPlayer<number> = {
    P1: pre.players.P1.walls,
    P2: pre.players.P2.walls,
  };
  const cityDamage: PerPlayer<number> = {
    P1: pre.players.P1.cityDamage,
    P2: pre.players.P2.cityDamage,
  };
  const resources: PerPlayer<Resources> = {
    P1: { ...pre.players.P1.resources },
    P2: { ...pre.players.P2.resources },
  };
  const unitCard = new Map<string, { owner: PlayerId; cardId: string; seq: number }>();
  const casualties = new Set<string>();
  let outcome: ScenarioObservation['outcome'] | null = null;
  let winner: PlayerId | null = null;
  let breach = false;
  let gameEnded: ScenarioObservation['gameEnded'] = null;
  let eraEnded: PerPlayer<string[]> | null = null;

  for (const player of PLAYERS) {
    for (const u of pre.players[player].units) {
      unitCard.set(u.uid, { owner: player, cardId: u.cardId, seq: u.seq });
    }
  }

  // Si ricostruisce lo stato "post-battaglia" fermandosi alla transizione di Fine Era
  // (riporto Mura, nuovi massimali e raccolto della nuova Era non sono oggetto di verifica).
  for (const e of trace.battleEvents) {
    if (eraEnded !== null && e.type !== 'GameEnded') continue;
    switch (e.type) {
      case 'ResourcesChanged':
        resources[e.player] = { ...e.resources };
        break;
      case 'WallsModified':
        walls.P1 = e.wallsAfter.P1;
        walls.P2 = e.wallsAfter.P2;
        break;
      case 'BattlePhaseResolved':
        for (const player of PLAYERS) {
          for (const uid of e.casualties[player]) casualties.add(uid);
        }
        break;
      case 'BattleOutcome':
        outcome = e.kind;
        winner = e.winner ?? null;
        break;
      case 'SiegeResolved':
        breach = e.breach;
        walls[e.defender] = e.wallsAfter;
        cityDamage[e.defender] += e.directDamage;
        break;
      case 'EraEnded':
        eraEnded = {
          P1: [...e.discardedUnitUids.P1],
          P2: [...e.discardedUnitUids.P2],
        };
        break;
      case 'GameEnded':
        gameEnded = { kind: e.kind, winner: e.winner };
        break;
      default:
        break;
    }
  }

  if (outcome === null) {
    throw new ScenarioError('No BattleOutcome event emitted by the engine.');
  }

  const survivorUids: PerPlayer<string[]> = { P1: [], P2: [] };
  for (const [uid, info] of [...unitCard.entries()].sort((a, b) => a[1].seq - b[1].seq)) {
    if (!casualties.has(uid)) survivorUids[info.owner].push(uid);
  }

  // Controlli di coerenza interna tra eventi e stato finale.
  for (const player of PLAYERS) {
    const reference =
      eraEnded !== null ? eraEnded[player] : trace.final.players[player].units.map((u) => u.uid);
    const a = [...reference].sort().join(',');
    const b = [...survivorUids[player]].sort().join(',');
    if (a !== b) {
      throw new ScenarioError(
        `Inconsistent survivors for ${player}: events say [${b}], engine state says [${a}].`,
      );
    }
    if (eraEnded === null) {
      const fp = trace.final.players[player];
      if (fp.walls !== walls[player] || fp.cityDamage !== cityDamage[player]) {
        throw new ScenarioError(
          `Inconsistent walls/cityDamage for ${player} between events and final state.`,
        );
      }
    }
  }

  return {
    outcome,
    winner,
    survivors: {
      P1: survivorUids.P1.map((uid) => unitCard.get(uid)!.cardId),
      P2: survivorUids.P2.map((uid) => unitCard.get(uid)!.cardId),
    },
    wallsAfter: walls,
    cityDamageAfter: cityDamage,
    resourcesAfter: resources,
    breach,
    gameEnded,
    finalStateHash: stateHash(trace.final),
  };
}

// ---------------------------------------------------------------------------
// Anti-leak (TECH-SPEC §5.5)
// ---------------------------------------------------------------------------

function findLeaks(prepared: PreparedScenario, trace: ExecutionTrace): string[] {
  const leaks: string[] = [];
  const revealIndex = trace.states.indexOf(trace.preBattle);

  for (const viewer of PLAYERS) {
    const opponent = getOpponent(viewer);
    const alwaysSecret = [...prepared.secretUids[opponent]];
    const unitsSecret = prepared.unitUids[opponent];

    const scan = (json: string, secrets: readonly string[], where: string): void => {
      for (const uid of secrets) {
        if (json.includes(`"${uid}"`)) {
          leaks.push(`${where}: ${viewer} can see secret uid "${uid}" of ${opponent}.`);
        }
      }
    };

    const allEvents = [...prepared.bootstrapEvents, ...trace.events];
    let revealed = false;
    for (const e of allEvents) {
      if (e.type === 'UnitsRevealed') revealed = true;
      const projected = projectEvent(e, viewer);
      if (projected === null || projected === undefined) continue;
      const secrets =
        revealed || e.type === 'UnitsRevealed' ? alwaysSecret : [...alwaysSecret, ...unitsSecret];
      scan(JSON.stringify(projected), secrets, `event #${e.n} ${e.type}`);
    }

    trace.states.forEach((s, idx) => {
      const secrets = idx >= revealIndex ? alwaysSecret : [...alwaysSecret, ...unitsSecret];
      const view = playerView(s, viewer);
      scan(JSON.stringify(view), secrets, `playerView[step ${idx}, phase ${s.phase}]`);
      if (idx < revealIndex && view.opponent.units !== null) {
        leaks.push(
          `playerView[step ${idx}]: opponent units visible to ${viewer} before UnitsRevealed.`,
        );
      }
    });
  }
  return leaks;
}

// ---------------------------------------------------------------------------
// Confronto con le aspettative
// ---------------------------------------------------------------------------

function sameMultiset(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
}

function compare(scenario: ScenarioPayload, obs: ScenarioObservation): string[] {
  const exp = scenario.expect;
  const failures: string[] = [];
  const check = (label: string, ok: boolean, expected: unknown, actual: unknown): void => {
    if (!ok) {
      failures.push(
        `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
  };

  check('outcome', obs.outcome === exp.outcome, exp.outcome, obs.outcome);
  check('winner', obs.winner === exp.winner, exp.winner, obs.winner);
  for (const p of PLAYERS) {
    check(
      `survivors.${p}`,
      sameMultiset(obs.survivors[p], exp.survivors[p]),
      exp.survivors[p],
      obs.survivors[p],
    );
    check(
      `wallsAfter.${p}`,
      obs.wallsAfter[p] === exp.wallsAfter[p],
      exp.wallsAfter[p],
      obs.wallsAfter[p],
    );
    check(
      `cityDamageAfter.${p}`,
      obs.cityDamageAfter[p] === exp.cityDamageAfter[p],
      exp.cityDamageAfter[p],
      obs.cityDamageAfter[p],
    );
    if (exp.resourcesAfter !== undefined) {
      const e = exp.resourcesAfter[p];
      const a = obs.resourcesAfter[p];
      check(
        `resourcesAfter.${p}`,
        e.food === a.food && e.wood === a.wood && e.metal === a.metal,
        e,
        a,
      );
    }
  }
  if (exp.breach !== undefined) {
    check('breach', obs.breach === exp.breach, exp.breach, obs.breach);
  }
  if (exp.gameEnded !== undefined) {
    check(
      'gameEnded',
      obs.gameEnded !== null &&
        obs.gameEnded.kind === exp.gameEnded.kind &&
        obs.gameEnded.winner === exp.gameEnded.winner,
      exp.gameEnded,
      obs.gameEnded,
    );
  } else {
    check('gameEnded', obs.gameEnded === null, null, obs.gameEnded);
  }
  return failures;
}

// ---------------------------------------------------------------------------
// API e CLI
// ---------------------------------------------------------------------------

export function runScenario(
  scenario: ScenarioPayload,
  source: string,
  catalog: Record<string, CardRules>,
  fixedDecks: FixedDecks,
): ScenarioRunResult {
  try {
    const prepared = prepareScenario(scenario, catalog, fixedDecks);
    const trace = execute(prepared);
    const observation = observe(trace);
    const failures = compare(scenario, observation);
    failures.push(...findLeaks(prepared, trace));

    // Determinismo: una seconda esecuzione indipendente deve produrre lo stesso stateHash.
    const replay = execute(prepareScenario(scenario, catalog, fixedDecks));
    const replayHash = stateHash(replay.final);
    if (replayHash !== observation.finalStateHash) {
      failures.push(
        `determinism: replay stateHash ${replayHash} differs from ${observation.finalStateHash}`,
      );
    }

    return { id: scenario.id, source, ok: failures.length === 0, failures, observation };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { id: scenario.id, source, ok: false, failures: [message], observation: null };
  }
}

export function validateAllScenarios(rootDir: string): ScenarioRunResult[] {
  const catalog = loadCatalog(rootDir);
  const fixedDecks = loadFixedDecks(rootDir);
  const files = loadScenarioFiles(path.join(rootDir, 'data', 'scenarios'));

  const seenIds = new Map<string, string>();
  const results: ScenarioRunResult[] = [];
  for (const { source, scenarios } of files) {
    for (const scenario of scenarios) {
      const previous = seenIds.get(scenario.id);
      if (previous !== undefined) {
        results.push({
          id: scenario.id,
          source,
          ok: false,
          failures: [`duplicate scenario id (already defined in ${previous})`],
          observation: null,
        });
        continue;
      }
      seenIds.set(scenario.id, source);
      results.push(runScenario(scenario, source, catalog, fixedDecks));
    }
  }
  return results;
}

function main(): void {
  let results: ScenarioRunResult[];
  try {
    results = validateAllScenarios(process.cwd());
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (results.length === 0) {
    console.error('No scenarios found in data/scenarios/*.json.');
    process.exit(1);
  }

  for (const r of results) {
    if (r.ok) {
      console.log(`  PASS  ${r.id}  (${r.source})`);
    } else {
      console.error(`  FAIL  ${r.id}  (${r.source})`);
      for (const f of r.failures) console.error(`        - ${f}`);
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  if (failed > 0) {
    console.error(`\n${failed}/${results.length} scenario(s) failed.`);
    process.exit(1);
  }
  console.log(`\nOK: ${results.length}/${results.length} scenarios verified.`);
}

const isDirectRun =
  process.argv[1] !== undefined && path.basename(process.argv[1]) === 'validate-scenarios.ts';

if (isDirectRun) {
  main();
}
