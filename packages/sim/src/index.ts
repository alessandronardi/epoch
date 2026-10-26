// TECH-SPEC §7.2 — Orchestratore multi-worker runSimulation e aggregatore deterministico per @epochs/sim.

import { Worker } from 'node:worker_threads';
import { DEFAULT_BOT_CATALOG, type BotKind } from '../../bots/src/index.js';
import {
  PLAYERS_ORDER,
  canonicalizeJson,
  sha256Hex,
  type CardRules,
  type CardType,
  type DeckPayload,
  type EraNo,
  type PlayerId,
  type RulesConfig,
} from '../../engine/src/index.js';
import {
  createDeterministicBotRng,
  deriveGameSeed,
  runWorkerBatch,
  simulateGame,
  type CompetitorId,
  type EraMetricsRecord,
  type GameMetricsRecord,
  type SimulateGameParams,
  type WorkerBatchResult,
  type WorkerBatchTask,
} from './worker.js';

export {
  createDeterministicBotRng,
  deriveGameSeed,
  runWorkerBatch,
  simulateGame,
  type CompetitorId,
  type EraMetricsRecord,
  type GameMetricsRecord,
  type SimulateGameParams,
  type WorkerBatchResult,
  type WorkerBatchTask,
};

export interface SimulationOptions {
  readonly deckA: DeckPayload;
  readonly deckB: DeckPayload;
  readonly botA: BotKind;
  readonly botB: BotKind;
  readonly games: number;
  readonly seed: string;
  readonly workers?: number;
  readonly catalog?: Readonly<Record<string, CardRules>>;
  readonly rules?: Partial<RulesConfig>;
  readonly maxSteps?: number;
}

export interface PlayerSeatReport {
  readonly player: PlayerId;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly winRate: number;
}

export interface CompetitorReport {
  readonly competitor: CompetitorId;
  readonly deckId: string;
  readonly deckName: string;
  readonly botKind: BotKind;
  readonly gamesAsP1: number;
  readonly gamesAsP2: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly winRate: number;
}

export interface ArchetypeReport {
  readonly deckId: string;
  readonly deckName: string;
  readonly entries: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly winRate: number;
}

export interface OutcomeBreakdownReport {
  readonly annihilation: number;
  readonly points: number;
  readonly draw: number;
  readonly concession: number;
  readonly timeout: number;
  readonly rates: {
    readonly annihilation: number;
    readonly points: number;
    readonly draw: number;
    readonly concession: number;
    readonly timeout: number;
  };
}

export interface WallsHistogramReport {
  readonly sampleCount: number;
  readonly totalWalls: number;
  readonly meanWalls: number;
  readonly minWalls: number;
  readonly maxWalls: number;
  readonly histogram: Record<string, number>;
}

export interface BattleOutcomesSummary {
  readonly totalBattles: number;
  readonly winnerCount: number;
  readonly stalemateCount: number;
  readonly mutualAnnihilationCount: number;
  readonly winnerRate: number;
  readonly stalemateRate: number;
  readonly mutualAnnihilationRate: number;
}

export interface EraAggregatedReport {
  readonly era: EraNo;
  readonly erasPlayed: number;
  readonly totalCycles: number;
  readonly avgCycles: number;
  readonly minCycles: number;
  readonly maxCycles: number;
  readonly siegesCount: number;
  readonly breachesCount: number;
  readonly breachRate: number;
  readonly breachesByPlayer: Record<PlayerId, number>;
  readonly totalDirectDamage: number;
  readonly avgDirectDamage: number;
  readonly directDamageByAttacker: Record<PlayerId, number>;
  readonly battleOutcomes: BattleOutcomesSummary;
  readonly wallsAfterDistribution: WallsHistogramReport;
  readonly raidsCount: number;
  readonly totalFoodRaided: number;
  readonly totalWoodRaided: number;
  readonly avgFoodRaided: number;
  readonly avgWoodRaided: number;
}

export interface RaidsAggregatedReport {
  readonly raidsCount: number;
  readonly totalFoodRaided: number;
  readonly totalWoodRaided: number;
  readonly totalResourcesRaided: number;
  readonly avgFoodRaidedPerGame: number;
  readonly avgWoodRaidedPerGame: number;
  readonly avgTotalRaidedPerGame: number;
}

export interface CardSimulationStats {
  readonly cardId: string;
  readonly era: EraNo;
  readonly type: CardType;
  readonly copiesInDecks: number;
  readonly gamesInDeck: number;
  readonly winsWhenInDeck: number;
  readonly winRateWhenInDeck: number;
  readonly gamesDrawn: number;
  readonly copiesDrawn: number;
  readonly gamesPlayed: number;
  readonly copiesPlayed: number;
  readonly winsWhenPlayed: number;
  readonly lossesWhenPlayed: number;
  readonly drawsWhenPlayed: number;
  readonly playRatePerGame: number;
  readonly playRateWhenDrawn: number;
  readonly winRateWhenPlayed: number;
}

export interface SimulationReport {
  readonly seed: string;
  readonly games: number;
  readonly deckA: {
    readonly id: string;
    readonly name: string;
    readonly bot: BotKind;
  };
  readonly deckB: {
    readonly id: string;
    readonly name: string;
    readonly bot: BotKind;
  };
  readonly byPlayer: Record<PlayerId, PlayerSeatReport>;
  readonly byCompetitor: Record<CompetitorId, CompetitorReport>;
  readonly byArchetype: Record<string, ArchetypeReport>;
  readonly outcomes: OutcomeBreakdownReport;
  readonly battleOutcomes: BattleOutcomesSummary;
  readonly byEra: Record<EraNo, EraAggregatedReport>;
  readonly finalWallsDistribution: WallsHistogramReport;
  readonly raids: RaidsAggregatedReport;
  readonly cardStats: Record<string, CardSimulationStats>;
  readonly reportHash: string;
}

const ERAS_ORDER: readonly EraNo[] = [1, 2, 3];

function safeRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(6));
}

function getDeckId(deck: DeckPayload): string {
  return deck.id ?? deck.name;
}

function countDeckCardCopies(deck: DeckPayload): Map<string, number> {
  const counts = new Map<string, number>();
  for (const eraKey of ['1', '2', '3'] as const) {
    for (const cardId of deck.subdecks[eraKey]) {
      counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
    }
  }
  return counts;
}

function buildWallsHistogram(samples: readonly number[]): WallsHistogramReport {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      totalWalls: 0,
      meanWalls: 0,
      minWalls: 0,
      maxWalls: 0,
      histogram: {},
    };
  }

  let totalWalls = 0;
  let minWalls = Number.POSITIVE_INFINITY;
  let maxWalls = Number.NEGATIVE_INFINITY;
  const rawCounts = new Map<number, number>();

  for (const wallValue of samples) {
    totalWalls += wallValue;
    if (wallValue < minWalls) {
      minWalls = wallValue;
    }
    if (wallValue > maxWalls) {
      maxWalls = wallValue;
    }
    rawCounts.set(wallValue, (rawCounts.get(wallValue) ?? 0) + 1);
  }

  const sortedKeys = Array.from(rawCounts.keys()).sort((a, b) => a - b);
  const histogram: Record<string, number> = {};
  for (const key of sortedKeys) {
    histogram[String(key)] = rawCounts.get(key)!;
  }

  return {
    sampleCount: samples.length,
    totalWalls,
    meanWalls: safeRatio(totalWalls, samples.length),
    minWalls,
    maxWalls,
    histogram,
  };
}

function buildBattleOutcomesSummary(
  winnerCount: number,
  stalemateCount: number,
  mutualAnnihilationCount: number,
): BattleOutcomesSummary {
  const totalBattles =
    winnerCount + stalemateCount + mutualAnnihilationCount;
  return {
    totalBattles,
    winnerCount,
    stalemateCount,
    mutualAnnihilationCount,
    winnerRate: safeRatio(winnerCount, totalBattles),
    stalemateRate: safeRatio(stalemateCount, totalBattles),
    mutualAnnihilationRate: safeRatio(mutualAnnihilationCount, totalBattles),
  };
}

/**
 * Ripartisce gli indici `0 .. games - 1` in `workerCount` batch contigui/bilanciati.
 */
export function partitionGameIndices(
  games: number,
  workerCount: number,
): number[][] {
  if (!Number.isInteger(games) || games < 0) {
    throw new Error(`Invalid games count: ${games} (must be an integer >= 0).`);
  }
  if (!Number.isInteger(workerCount) || workerCount < 1) {
    throw new Error(
      `Invalid workerCount: ${workerCount} (must be an integer >= 1).`,
    );
  }
  if (games === 0) {
    return [];
  }

  const effectiveWorkers = Math.min(games, workerCount);
  const baseBatchSize = Math.floor(games / effectiveWorkers);
  const remainder = games % effectiveWorkers;

  const batches: number[][] = [];
  let cursor = 0;
  for (let w = 0; w < effectiveWorkers; w++) {
    const size = baseBatchSize + (w < remainder ? 1 : 0);
    const indices: number[] = [];
    for (let i = 0; i < size; i++) {
      indices.push(cursor++);
    }
    batches.push(indices);
  }

  return batches;
}

/**
 * Aggrega in modo puramente deterministico un array di `GameMetricsRecord`
 * ordinandoli preventivamente per `gameIndex` crescente.
 */
export function aggregateSimulationRecords(
  records: readonly GameMetricsRecord[],
  options: SimulationOptions,
): SimulationReport {
  const catalog = options.catalog ?? DEFAULT_BOT_CATALOG;
  const sortedRecords = [...records].sort(
    (a, b) => a.gameIndex - b.gameIndex,
  );
  const totalGames = sortedRecords.length;

  const seatCounts: Record<
    PlayerId,
    { wins: number; losses: number; draws: number }
  > = {
    P1: { wins: 0, losses: 0, draws: 0 },
    P2: { wins: 0, losses: 0, draws: 0 },
  };

  const competitorCounts: Record<
    CompetitorId,
    {
      gamesAsP1: number;
      gamesAsP2: number;
      wins: number;
      losses: number;
      draws: number;
    }
  > = {
    A: { gamesAsP1: 0, gamesAsP2: 0, wins: 0, losses: 0, draws: 0 },
    B: { gamesAsP1: 0, gamesAsP2: 0, wins: 0, losses: 0, draws: 0 },
  };

  const archetypeAccumulators = new Map<
    string,
    {
      deckId: string;
      deckName: string;
      entries: number;
      wins: number;
      losses: number;
      draws: number;
    }
  >();

  const deckAId = getDeckId(options.deckA);
  const deckBId = getDeckId(options.deckB);

  for (const deck of [options.deckA, options.deckB]) {
    const deckId = getDeckId(deck);
    if (!archetypeAccumulators.has(deckId)) {
      archetypeAccumulators.set(deckId, {
        deckId,
        deckName: deck.name,
        entries: 0,
        wins: 0,
        losses: 0,
        draws: 0,
      });
    }
  }

  const outcomeCounts = {
    annihilation: 0,
    points: 0,
    draw: 0,
    concession: 0,
    timeout: 0,
  };

  let overallBattleWinners = 0;
  let overallBattleStalemates = 0;
  let overallBattleMutualAnnihilations = 0;

  let overallRaidsCount = 0;
  let overallFoodRaided = 0;
  let overallWoodRaided = 0;

  const finalWallSamples: number[] = [];

  const eraAccumulators: Record<
    EraNo,
    {
      erasPlayed: number;
      totalCycles: number;
      minCycles: number;
      maxCycles: number;
      siegesCount: number;
      breachesCount: number;
      breachesByPlayer: Record<PlayerId, number>;
      totalDirectDamage: number;
      directDamageByAttacker: Record<PlayerId, number>;
      winnerCount: number;
      stalemateCount: number;
      mutualAnnihilationCount: number;
      wallSamples: number[];
      raidsCount: number;
      totalFoodRaided: number;
      totalWoodRaided: number;
    }
  > = {
    1: {
      erasPlayed: 0,
      totalCycles: 0,
      minCycles: Number.POSITIVE_INFINITY,
      maxCycles: 0,
      siegesCount: 0,
      breachesCount: 0,
      breachesByPlayer: { P1: 0, P2: 0 },
      totalDirectDamage: 0,
      directDamageByAttacker: { P1: 0, P2: 0 },
      winnerCount: 0,
      stalemateCount: 0,
      mutualAnnihilationCount: 0,
      wallSamples: [],
      raidsCount: 0,
      totalFoodRaided: 0,
      totalWoodRaided: 0,
    },
    2: {
      erasPlayed: 0,
      totalCycles: 0,
      minCycles: Number.POSITIVE_INFINITY,
      maxCycles: 0,
      siegesCount: 0,
      breachesCount: 0,
      breachesByPlayer: { P1: 0, P2: 0 },
      totalDirectDamage: 0,
      directDamageByAttacker: { P1: 0, P2: 0 },
      winnerCount: 0,
      stalemateCount: 0,
      mutualAnnihilationCount: 0,
      wallSamples: [],
      raidsCount: 0,
      totalFoodRaided: 0,
      totalWoodRaided: 0,
    },
    3: {
      erasPlayed: 0,
      totalCycles: 0,
      minCycles: Number.POSITIVE_INFINITY,
      maxCycles: 0,
      siegesCount: 0,
      breachesCount: 0,
      breachesByPlayer: { P1: 0, P2: 0 },
      totalDirectDamage: 0,
      directDamageByAttacker: { P1: 0, P2: 0 },
      winnerCount: 0,
      stalemateCount: 0,
      mutualAnnihilationCount: 0,
      wallSamples: [],
      raidsCount: 0,
      totalFoodRaided: 0,
      totalWoodRaided: 0,
    },
  };

  const sortedCardIds = Object.keys(catalog).sort();
  const deckACardCounts = countDeckCardCopies(options.deckA);
  const deckBCardCounts = countDeckCardCopies(options.deckB);

  const cardAccumulators = new Map<
    string,
    {
      cardId: string;
      era: EraNo;
      type: CardType;
      copiesInDecks: number;
      gamesInDeck: number;
      winsWhenInDeck: number;
      gamesDrawn: number;
      copiesDrawn: number;
      gamesPlayed: number;
      copiesPlayed: number;
      winsWhenPlayed: number;
      lossesWhenPlayed: number;
      drawsWhenPlayed: number;
    }
  >();

  for (const cardId of sortedCardIds) {
    const rules = catalog[cardId]!;
    cardAccumulators.set(cardId, {
      cardId,
      era: rules.era,
      type: rules.type,
      copiesInDecks: 0,
      gamesInDeck: 0,
      winsWhenInDeck: 0,
      gamesDrawn: 0,
      copiesDrawn: 0,
      gamesPlayed: 0,
      copiesPlayed: 0,
      winsWhenPlayed: 0,
      lossesWhenPlayed: 0,
      drawsWhenPlayed: 0,
    });
  }

  for (const record of sortedRecords) {
    outcomeCounts[record.resultKind] += 1;

    if (record.aSeat === 'P1') {
      competitorCounts.A.gamesAsP1 += 1;
      competitorCounts.B.gamesAsP2 += 1;
    } else {
      competitorCounts.A.gamesAsP2 += 1;
      competitorCounts.B.gamesAsP1 += 1;
    }

    if (record.winner === 'DRAW') {
      seatCounts.P1.draws += 1;
      seatCounts.P2.draws += 1;
    } else if (record.winner === 'P1') {
      seatCounts.P1.wins += 1;
      seatCounts.P2.losses += 1;
    } else {
      seatCounts.P2.wins += 1;
      seatCounts.P1.losses += 1;
    }

    const archA = archetypeAccumulators.get(deckAId)!;
    const archB = archetypeAccumulators.get(deckBId)!;
    archA.entries += 1;
    archB.entries += 1;

    if (record.winnerCompetitor === 'DRAW') {
      competitorCounts.A.draws += 1;
      competitorCounts.B.draws += 1;
      archA.draws += 1;
      archB.draws += 1;
    } else if (record.winnerCompetitor === 'A') {
      competitorCounts.A.wins += 1;
      competitorCounts.B.losses += 1;
      archA.wins += 1;
      archB.losses += 1;
    } else {
      competitorCounts.B.wins += 1;
      competitorCounts.A.losses += 1;
      archB.wins += 1;
      archA.losses += 1;
    }

    finalWallSamples.push(record.finalWalls.P1, record.finalWalls.P2);

    for (const era of ERAS_ORDER) {
      const eraRec = record.eras[era];
      if (eraRec === undefined) {
        continue;
      }

      const acc = eraAccumulators[era];
      acc.erasPlayed += 1;
      acc.totalCycles += eraRec.cycles;
      if (eraRec.cycles < acc.minCycles) {
        acc.minCycles = eraRec.cycles;
      }
      if (eraRec.cycles > acc.maxCycles) {
        acc.maxCycles = eraRec.cycles;
      }

      if (eraRec.battleOutcome === 'winner') {
        acc.winnerCount += 1;
        overallBattleWinners += 1;
      } else if (eraRec.battleOutcome === 'stalemate') {
        acc.stalemateCount += 1;
        overallBattleStalemates += 1;
      } else if (eraRec.battleOutcome === 'mutual_annihilation') {
        acc.mutualAnnihilationCount += 1;
        overallBattleMutualAnnihilations += 1;
      }

      if (eraRec.siegeExecuted) {
        acc.siegesCount += 1;
      }

      if (eraRec.breach) {
        acc.breachesCount += 1;
        if (eraRec.breachAttacker !== null) {
          acc.breachesByPlayer[eraRec.breachAttacker] += 1;
        }
      }

      acc.totalDirectDamage += eraRec.directDamage;
      acc.directDamageByAttacker.P1 += eraRec.directDamageByAttacker.P1;
      acc.directDamageByAttacker.P2 += eraRec.directDamageByAttacker.P2;

      acc.wallSamples.push(eraRec.wallsAfter.P1, eraRec.wallsAfter.P2);

      if (eraRec.raidAttacker !== null) {
        acc.raidsCount += 1;
        acc.totalFoodRaided += eraRec.raidedFood;
        acc.totalWoodRaided += eraRec.raidedWood;

        overallRaidsCount += 1;
        overallFoodRaided += eraRec.raidedFood;
        overallWoodRaided += eraRec.raidedWood;
      }
    }

    // Statistiche per singola carta per ciascuno dei due giocatori (P1, P2)
    for (const player of PLAYERS_ORDER) {
      const deckCounts =
        player === record.aSeat ? deckACardCounts : deckBCardCounts;
      const drawnMap = record.cardsDrawnByPlayer[player];
      const playedMap = record.cardsPlayedByPlayer[player];
      const playerWon = record.winner === player;
      const playerDrew = record.winner === 'DRAW';

      for (const [cardId, copiesInDeck] of deckCounts.entries()) {
        const cardAcc = cardAccumulators.get(cardId);
        if (cardAcc === undefined) {
          continue;
        }
        cardAcc.copiesInDecks += copiesInDeck;
        cardAcc.gamesInDeck += 1;
        if (playerWon) {
          cardAcc.winsWhenInDeck += 1;
        }
      }

      for (const cardId of Object.keys(drawnMap)) {
        const drawnCount = drawnMap[cardId] ?? 0;
        if (drawnCount <= 0) {
          continue;
        }
        const cardAcc = cardAccumulators.get(cardId);
        if (cardAcc === undefined) {
          continue;
        }
        cardAcc.gamesDrawn += 1;
        cardAcc.copiesDrawn += drawnCount;
      }

      for (const cardId of Object.keys(playedMap)) {
        const playedCount = playedMap[cardId] ?? 0;
        if (playedCount <= 0) {
          continue;
        }
        const cardAcc = cardAccumulators.get(cardId);
        if (cardAcc === undefined) {
          continue;
        }
        cardAcc.gamesPlayed += 1;
        cardAcc.copiesPlayed += playedCount;
        if (playerWon) {
          cardAcc.winsWhenPlayed += 1;
        } else if (playerDrew) {
          cardAcc.drawsWhenPlayed += 1;
        } else {
          cardAcc.lossesWhenPlayed += 1;
        }
      }
    }
  }

  const byPlayer: Record<PlayerId, PlayerSeatReport> = {
    P1: {
      player: 'P1',
      wins: seatCounts.P1.wins,
      losses: seatCounts.P1.losses,
      draws: seatCounts.P1.draws,
      winRate: safeRatio(seatCounts.P1.wins, totalGames),
    },
    P2: {
      player: 'P2',
      wins: seatCounts.P2.wins,
      losses: seatCounts.P2.losses,
      draws: seatCounts.P2.draws,
      winRate: safeRatio(seatCounts.P2.wins, totalGames),
    },
  };

  const byCompetitor: Record<CompetitorId, CompetitorReport> = {
    A: {
      competitor: 'A',
      deckId: deckAId,
      deckName: options.deckA.name,
      botKind: options.botA,
      gamesAsP1: competitorCounts.A.gamesAsP1,
      gamesAsP2: competitorCounts.A.gamesAsP2,
      wins: competitorCounts.A.wins,
      losses: competitorCounts.A.losses,
      draws: competitorCounts.A.draws,
      winRate: safeRatio(competitorCounts.A.wins, totalGames),
    },
    B: {
      competitor: 'B',
      deckId: deckBId,
      deckName: options.deckB.name,
      botKind: options.botB,
      gamesAsP1: competitorCounts.B.gamesAsP1,
      gamesAsP2: competitorCounts.B.gamesAsP2,
      wins: competitorCounts.B.wins,
      losses: competitorCounts.B.losses,
      draws: competitorCounts.B.draws,
      winRate: safeRatio(competitorCounts.B.wins, totalGames),
    },
  };

  const byArchetype: Record<string, ArchetypeReport> = {};
  const sortedArchetypeIds = Array.from(archetypeAccumulators.keys()).sort();
  for (const deckId of sortedArchetypeIds) {
    const arch = archetypeAccumulators.get(deckId)!;
    byArchetype[deckId] = {
      deckId: arch.deckId,
      deckName: arch.deckName,
      entries: arch.entries,
      wins: arch.wins,
      losses: arch.losses,
      draws: arch.draws,
      winRate: safeRatio(arch.wins, arch.entries),
    };
  }

  const outcomes: OutcomeBreakdownReport = {
    annihilation: outcomeCounts.annihilation,
    points: outcomeCounts.points,
    draw: outcomeCounts.draw,
    concession: outcomeCounts.concession,
    timeout: outcomeCounts.timeout,
    rates: {
      annihilation: safeRatio(outcomeCounts.annihilation, totalGames),
      points: safeRatio(outcomeCounts.points, totalGames),
      draw: safeRatio(outcomeCounts.draw, totalGames),
      concession: safeRatio(outcomeCounts.concession, totalGames),
      timeout: safeRatio(outcomeCounts.timeout, totalGames),
    },
  };

  const byEra = {} as Record<EraNo, EraAggregatedReport>;
  for (const era of ERAS_ORDER) {
    const acc = eraAccumulators[era];
    byEra[era] = {
      era,
      erasPlayed: acc.erasPlayed,
      totalCycles: acc.totalCycles,
      avgCycles: safeRatio(acc.totalCycles, acc.erasPlayed),
      minCycles: acc.erasPlayed > 0 ? acc.minCycles : 0,
      maxCycles: acc.erasPlayed > 0 ? acc.maxCycles : 0,
      siegesCount: acc.siegesCount,
      breachesCount: acc.breachesCount,
      breachRate: safeRatio(acc.breachesCount, acc.erasPlayed),
      breachesByPlayer: {
        P1: acc.breachesByPlayer.P1,
        P2: acc.breachesByPlayer.P2,
      },
      totalDirectDamage: acc.totalDirectDamage,
      avgDirectDamage: safeRatio(acc.totalDirectDamage, acc.erasPlayed),
      directDamageByAttacker: {
        P1: acc.directDamageByAttacker.P1,
        P2: acc.directDamageByAttacker.P2,
      },
      battleOutcomes: buildBattleOutcomesSummary(
        acc.winnerCount,
        acc.stalemateCount,
        acc.mutualAnnihilationCount,
      ),
      wallsAfterDistribution: buildWallsHistogram(acc.wallSamples),
      raidsCount: acc.raidsCount,
      totalFoodRaided: acc.totalFoodRaided,
      totalWoodRaided: acc.totalWoodRaided,
      avgFoodRaided: safeRatio(acc.totalFoodRaided, acc.erasPlayed),
      avgWoodRaided: safeRatio(acc.totalWoodRaided, acc.erasPlayed),
    };
  }

  const totalPlayerGameEntries = totalGames * 2;
  const cardStats: Record<string, CardSimulationStats> = {};
  for (const cardId of sortedCardIds) {
    const cardAcc = cardAccumulators.get(cardId)!;
    cardStats[cardId] = {
      cardId: cardAcc.cardId,
      era: cardAcc.era,
      type: cardAcc.type,
      copiesInDecks: cardAcc.copiesInDecks,
      gamesInDeck: cardAcc.gamesInDeck,
      winsWhenInDeck: cardAcc.winsWhenInDeck,
      winRateWhenInDeck: safeRatio(
        cardAcc.winsWhenInDeck,
        cardAcc.gamesInDeck,
      ),
      gamesDrawn: cardAcc.gamesDrawn,
      copiesDrawn: cardAcc.copiesDrawn,
      gamesPlayed: cardAcc.gamesPlayed,
      copiesPlayed: cardAcc.copiesPlayed,
      winsWhenPlayed: cardAcc.winsWhenPlayed,
      lossesWhenPlayed: cardAcc.lossesWhenPlayed,
      drawsWhenPlayed: cardAcc.drawsWhenPlayed,
      playRatePerGame: safeRatio(cardAcc.gamesPlayed, totalPlayerGameEntries),
      playRateWhenDrawn: safeRatio(cardAcc.gamesPlayed, cardAcc.gamesDrawn),
      winRateWhenPlayed: safeRatio(
        cardAcc.winsWhenPlayed,
        cardAcc.gamesPlayed,
      ),
    };
  }

  const totalResourcesRaided = overallFoodRaided + overallWoodRaided;
  const partialReport = {
    seed: options.seed,
    games: totalGames,
    deckA: {
      id: deckAId,
      name: options.deckA.name,
      bot: options.botA,
    },
    deckB: {
      id: deckBId,
      name: options.deckB.name,
      bot: options.botB,
    },
    byPlayer,
    byCompetitor,
    byArchetype,
    outcomes,
    battleOutcomes: buildBattleOutcomesSummary(
      overallBattleWinners,
      overallBattleStalemates,
      overallBattleMutualAnnihilations,
    ),
    byEra,
    finalWallsDistribution: buildWallsHistogram(finalWallSamples),
    raids: {
      raidsCount: overallRaidsCount,
      totalFoodRaided: overallFoodRaided,
      totalWoodRaided: overallWoodRaided,
      totalResourcesRaided,
      avgFoodRaidedPerGame: safeRatio(overallFoodRaided, totalGames),
      avgWoodRaidedPerGame: safeRatio(overallWoodRaided, totalGames),
      avgTotalRaidedPerGame: safeRatio(totalResourcesRaided, totalGames),
    },
    cardStats,
  };

  const reportHash = sha256Hex(canonicalizeJson(partialReport));
  return {
    ...partialReport,
    reportHash,
  };
}

const WORKER_TS_RESOLVE_HOOK = [
  'import { registerHooks } from "node:module";',
  'import { existsSync } from "node:fs";',
  'import { fileURLToPath } from "node:url";',
  'registerHooks({',
  '  resolve(specifier, context, nextResolve) {',
  '    if (specifier.endsWith(".js") && context.parentURL && context.parentURL.startsWith("file:")) {',
  '      const jsUrl = new URL(specifier, context.parentURL);',
  '      if (!existsSync(fileURLToPath(jsUrl))) {',
  '        const tsUrl = new URL(specifier.slice(0, -3) + ".ts", context.parentURL);',
  '        if (existsSync(fileURLToPath(tsUrl))) {',
  '          return nextResolve(tsUrl.href, context);',
  '        }',
  '      }',
  '    }',
  '    return nextResolve(specifier, context);',
  '  }',
  '});',
].join('\n');

function buildWorkerExecArgv(): string[] {
  const preloadDataUrl = `data:text/javascript,${encodeURIComponent(WORKER_TS_RESOLVE_HOOK)}`;
  return ['--no-warnings', '--import', preloadDataUrl];
}

function spawnWorkerBatch(task: WorkerBatchTask): Promise<WorkerBatchResult> {
  return new Promise<WorkerBatchResult>((resolve, reject) => {
    const workerUrl = new URL('./worker.ts', import.meta.url);
    const worker = new Worker(workerUrl, {
      workerData: task,
      execArgv: buildWorkerExecArgv(),
      env: { ...process.env, NODE_OPTIONS: '' },
    });

    let settled = false;

    worker.on('message', (result: WorkerBatchResult) => {
      settled = true;
      void worker.terminate().then(() => resolve(result), () => resolve(result));
    });

    worker.on('error', (err: Error) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    worker.on('exit', (code: number) => {
      if (!settled && code !== 0) {
        settled = true;
        reject(
          new Error(
            `Simulation worker ${task.workerId} exited with non-zero code ${code}.`,
          ),
        );
      }
    });
  });
}

/**
 * Esegue una simulazione headless completa (single-worker o multi-worker con `worker_threads`),
 * aggregando i risultati in ordine di `gameIndex` così che a parità di `--seed` e parametri
 * il report sia identico al 100% indipendentemente dal numero di worker.
 */
export async function runSimulation(
  options: SimulationOptions,
): Promise<SimulationReport> {
  const workers = options.workers ?? 1;
  const batches = partitionGameIndices(options.games, workers);

  if (batches.length === 0) {
    return aggregateSimulationRecords([], options);
  }

  if (batches.length === 1) {
    const singleTask: WorkerBatchTask = {
      workerId: 0,
      masterSeed: options.seed,
      gameIndices: batches[0]!,
      deckA: options.deckA,
      deckB: options.deckB,
      botA: options.botA,
      botB: options.botB,
      ...(options.catalog !== undefined ? { catalog: options.catalog } : {}),
      ...(options.rules !== undefined ? { rules: options.rules } : {}),
      ...(options.maxSteps !== undefined ? { maxSteps: options.maxSteps } : {}),
    };
    const batchResult = runWorkerBatch(singleTask);
    return aggregateSimulationRecords(batchResult.records, options);
  }

  const tasks: WorkerBatchTask[] = batches.map((gameIndices, workerId) => ({
    workerId,
    masterSeed: options.seed,
    gameIndices,
    deckA: options.deckA,
    deckB: options.deckB,
    botA: options.botA,
    botB: options.botB,
    ...(options.catalog !== undefined ? { catalog: options.catalog } : {}),
    ...(options.rules !== undefined ? { rules: options.rules } : {}),
    ...(options.maxSteps !== undefined ? { maxSteps: options.maxSteps } : {}),
  }));

  const batchResults = await Promise.all(
    tasks.map((task) => spawnWorkerBatch(task)),
  );

  const allRecords: GameMetricsRecord[] = [];
  for (const batchResult of batchResults) {
    allRecords.push(...batchResult.records);
  }

  return aggregateSimulationRecords(allRecords, options);
}

/**
 * Formatta le statistiche per carta e di riepilogo del report in formato CSV deterministico (TECH-SPEC §7.2).
 */
export function formatReportAsCsv(report: SimulationReport): string {
  const lines: string[] = [
    'cardId,era,type,copiesInDecks,gamesInDeck,winsWhenInDeck,winRateWhenInDeck,gamesDrawn,copiesDrawn,gamesPlayed,copiesPlayed,winsWhenPlayed,lossesWhenPlayed,drawsWhenPlayed,playRatePerGame,playRateWhenDrawn,winRateWhenPlayed',
  ];

  const sortedCardIds = Object.keys(report.cardStats).sort();
  for (const cardId of sortedCardIds) {
    const s = report.cardStats[cardId]!;
    lines.push(
      [
        s.cardId,
        s.era,
        s.type,
        s.copiesInDecks,
        s.gamesInDeck,
        s.winsWhenInDeck,
        s.winRateWhenInDeck,
        s.gamesDrawn,
        s.copiesDrawn,
        s.gamesPlayed,
        s.copiesPlayed,
        s.winsWhenPlayed,
        s.lossesWhenPlayed,
        s.drawsWhenPlayed,
        s.playRatePerGame,
        s.playRateWhenDrawn,
        s.winRateWhenPlayed,
      ].join(','),
    );
  }

  return `${lines.join('\n')}\n`;
}
