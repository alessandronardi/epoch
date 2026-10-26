// TECH-SPEC §7.2, §12 M2 — Test di riproducibilità bit-per-bit multi-worker, completezza metriche, CLI e prestazioni per @epochs/sim.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DeckPayload } from '../../engine/src/index.js';
import aggroBreachJson from '../../../data/decks/aggro-breach.json' with { type: 'json' };
import balancedTacticalJson from '../../../data/decks/balanced-tactical.json' with { type: 'json' };
import boomEconomyJson from '../../../data/decks/boom-economy.json' with { type: 'json' };
import {
  loadDeckFromFile,
  parseCliArgs,
  resolveSimPath,
  runCli,
} from '../src/cli.js';
import {
  aggregateSimulationRecords,
  deriveGameSeed,
  formatReportAsCsv,
  partitionGameIndices,
  runSimulation,
  runWorkerBatch,
  simulateGame,
} from '../src/index.js';

const aggroDeck = aggroBreachJson as unknown as DeckPayload;
const balancedDeck = balancedTacticalJson as unknown as DeckPayload;
const boomDeck = boomEconomyJson as unknown as DeckPayload;

describe('Task M2-04 & M2-05: @epochs/sim — Worker, Aggregatore Multi-Worker e Riproducibilità', () => {
  it('esegue simulateGame in modo puramente deterministico indipendentemente dall’ordine di invocazione', () => {
    const rec5First = simulateGame({
      masterSeed: 'epochs-det-seed',
      gameIndex: 5,
      deckA: aggroDeck,
      deckB: boomDeck,
      botA: 'greedy',
      botB: 'greedy',
    });

    // Eseguiamo altre partite in mezzo e poi ricalcoliamo gameIndex = 5
    simulateGame({
      masterSeed: 'epochs-det-seed',
      gameIndex: 0,
      deckA: aggroDeck,
      deckB: boomDeck,
      botA: 'random',
      botB: 'rational',
    });

    const rec5Second = simulateGame({
      masterSeed: 'epochs-det-seed',
      gameIndex: 5,
      deckA: aggroDeck,
      deckB: boomDeck,
      botA: 'greedy',
      botB: 'greedy',
    });

    expect(deriveGameSeed('epochs-det-seed', 5)).toBe('epochs-det-seed:5');
    expect(JSON.stringify(rec5Second)).toBe(JSON.stringify(rec5First));
    expect(rec5First.aSeat).toBe('P2');
    expect(rec5First.bSeat).toBe('P1');
  });

  it('ripartisce correttamente gli indici di partita e aggrega in ordine di gameIndex anche se i batch arrivano fuori ordine', () => {
    expect(partitionGameIndices(0, 4)).toEqual([]);
    expect(partitionGameIndices(10, 4)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7],
      [8, 9],
    ]);
    expect(() => partitionGameIndices(-1, 2)).toThrow(/Invalid games count/);
    expect(() => partitionGameIndices(10, 0)).toThrow(/Invalid workerCount/);

    const batchA = runWorkerBatch({
      workerId: 0,
      masterSeed: 'batch-order-seed',
      gameIndices: [0, 1, 2, 3],
      deckA: aggroDeck,
      deckB: balancedDeck,
      botA: 'greedy',
      botB: 'rational',
    });
    const batchB = runWorkerBatch({
      workerId: 1,
      masterSeed: 'batch-order-seed',
      gameIndices: [4, 5, 6, 7],
      deckA: aggroDeck,
      deckB: balancedDeck,
      botA: 'greedy',
      botB: 'rational',
    });

    const options = {
      deckA: aggroDeck,
      deckB: balancedDeck,
      botA: 'greedy' as const,
      botB: 'rational' as const,
      games: 8,
      seed: 'batch-order-seed',
    };

    const reportInOrder = aggregateSimulationRecords(
      [...batchA.records, ...batchB.records],
      options,
    );
    const reportReversed = aggregateSimulationRecords(
      [...batchB.records.slice().reverse(), ...batchA.records.slice().reverse()],
      options,
    );

    expect(reportReversed.reportHash).toBe(reportInOrder.reportHash);
    expect(JSON.stringify(reportReversed)).toBe(JSON.stringify(reportInOrder));
  });

  it(
    'produce un report identico bit per bit tra workers: 1 e workers: 4 a parità di seed e verifica tutte le metriche §7.2',
    async () => {
      const commonOptions = {
        deckA: aggroDeck,
        deckB: boomDeck,
        botA: 'greedy' as const,
        botB: 'greedy' as const,
        games: 40,
        seed: 'epochs-v1',
      };

      const [report1Worker, report4Workers] = await Promise.all([
        runSimulation({ ...commonOptions, workers: 1 }),
        runSimulation({ ...commonOptions, workers: 4 }),
      ]);

      // Identità bit per bit tra 1 worker e 4 worker
      expect(report4Workers.reportHash).toBe(report1Worker.reportHash);
      expect(JSON.stringify(report4Workers)).toBe(
        JSON.stringify(report1Worker),
      );
      expect(formatReportAsCsv(report4Workers)).toBe(
        formatReportAsCsv(report1Worker),
      );

      // Verifica integrità strutturale e numerica di tutte le metriche richieste in §7.2
      expect(report1Worker.games).toBe(40);
      expect(
        report1Worker.byPlayer.P1.wins +
          report1Worker.byPlayer.P1.losses +
          report1Worker.byPlayer.P1.draws,
      ).toBe(40);
      expect(
        report1Worker.byCompetitor.A. gamesAsP1 +
          report1Worker.byCompetitor.A.gamesAsP2,
      ).toBe(40);
      expect(report1Worker.byCompetitor.A.gamesAsP1).toBe(20);
      expect(report1Worker.byCompetitor.A.gamesAsP2).toBe(20);

      expect(report1Worker.byArchetype['aggro-breach']?.entries).toBe(40);
      expect(report1Worker.byArchetype['boom-economy']?.entries).toBe(40);

      const totalOutcomes =
        report1Worker.outcomes.annihilation +
        report1Worker.outcomes.points +
        report1Worker.outcomes.draw +
        report1Worker.outcomes.concession +
        report1Worker.outcomes.timeout;
      expect(totalOutcomes).toBe(40);

      // Era I è sempre giocata in tutte le 40 partite
      expect(report1Worker.byEra[1].erasPlayed).toBe(40);
      expect(report1Worker.byEra[1].avgCycles).toBeGreaterThanOrEqual(1);
      expect(
        report1Worker.byEra[1].wallsAfterDistribution.sampleCount,
      ).toBe(80);
      expect(report1Worker.finalWallsDistribution.sampleCount).toBe(80);

      // Tutte le 45 carte del catalogo devono essere presenti in cardStats e nel CSV
      const cardKeys = Object.keys(report1Worker.cardStats);
      expect(cardKeys.length).toBe(45);
      const csvLines = formatReportAsCsv(report1Worker).trim().split('\n');
      expect(csvLines.length).toBe(46); // 1 header + 45 carte
    },
    30000,
  );

  it('gestisce simulazioni con 0 partite e copre tutti i tipi di bot (random, greedy, rational)', async () => {
    const emptyReport = await runSimulation({
      deckA: aggroDeck,
      deckB: boomDeck,
      botA: 'random',
      botB: 'rational',
      games: 0,
      seed: 'empty-seed',
      workers: 2,
    });
    expect(emptyReport.games).toBe(0);
    expect(emptyReport.finalWallsDistribution.sampleCount).toBe(0);

    const mixedBotsReport = await runSimulation({
      deckA: balancedDeck,
      deckB: boomDeck,
      botA: 'random',
      botB: 'rational',
      games: 12,
      seed: 'mixed-bots-seed',
      workers: 2,
    });
    expect(mixedBotsReport.games).toBe(12);
    expect(mixedBotsReport.battleOutcomes.totalBattles).toBeGreaterThanOrEqual(
      12,
    );
  });

  it('valida il parsing degli argomenti CLI e la scrittura del report JSON/CSV su disco', async () => {
    const parsed = parseCliArgs([
      '--',
      '--deckA',
      'data/decks/aggro-breach.json',
      '--deckB',
      'data/decks/boom-economy.json',
      '--botA',
      'greedy',
      '--botB',
      'rational',
      '--games',
      '6',
      '--seed',
      'cli-seed-1',
      '--workers',
      '2',
      '--out',
      'tmp-report.json',
    ]);

    expect(parsed).toEqual({
      deckA: 'data/decks/aggro-breach.json',
      deckB: 'data/decks/boom-economy.json',
      botA: 'greedy',
      botB: 'rational',
      games: 6,
      seed: 'cli-seed-1',
      workers: 2,
      out: 'tmp-report.json',
    });

    expect(() => parseCliArgs(['--botA', 'invalid'])).toThrow(/Invalid value/);
    expect(() => parseCliArgs(['--games', '-5'])).toThrow(/Invalid value/);
    expect(() => parseCliArgs(['--workers', '0'])).toThrow(/Invalid value/);
    expect(() => parseCliArgs(['--seed'])).toThrow(/Missing value/);
    expect(() => parseCliArgs(['--unknownFlag'])).toThrow(
      /Unknown CLI argument/,
    );

    expect(resolveSimPath('data/decks/aggro-breach.json')).toContain(
      'aggro-breach.json',
    );
    const loadedDeck = loadDeckFromFile('data/decks/aggro-breach.json');
    expect(loadedDeck.id).toBe('aggro-breach');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epochs-sim-test-'));
    const jsonOutPath = path.join(tmpDir, 'out-report.json');
    const csvOutPath = path.join(tmpDir, 'out-report.csv');

    try {
      const cliReport = await runCli([
        '--deckA',
        'data/decks/aggro-breach.json',
        '--deckB',
        'data/decks/boom-economy.json',
        '--botA',
        'greedy',
        '--botB',
        'greedy',
        '--games',
        '4',
        '--seed',
        'cli-e2e-seed',
        '--workers',
        '1',
        '--out',
        jsonOutPath,
      ]);

      expect(fs.existsSync(jsonOutPath)).toBe(true);
      const diskReport = JSON.parse(fs.readFileSync(jsonOutPath, 'utf8'));
      expect(diskReport.reportHash).toBe(cliReport.reportHash);

      await runCli([
        '--games',
        '2',
        '--seed',
        'cli-csv-seed',
        '--workers',
        '1',
        '--out',
        csvOutPath,
      ]);
      expect(fs.existsSync(csvOutPath)).toBe(true);
      const csvContent = fs.readFileSync(csvOutPath, 'utf8');
      expect(csvContent).toContain('cardId,era,type,copiesInDecks');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it(
    'rispetta il requisito di throughput per 18.000 partite in < 60s su 4 worker (§7.2)',
    async () => {
      const SAMPLE_GAMES = 400;
      const startMs = performance.now();
      const report = await runSimulation({
        deckA: aggroDeck,
        deckB: boomDeck,
        botA: 'greedy',
        botB: 'greedy',
        games: SAMPLE_GAMES,
        seed: 'perf-benchmark-v1',
        workers: 4,
      });
      const elapsedMs = performance.now() - startMs;

      expect(report.games).toBe(SAMPLE_GAMES);
      // 18.000 partite in < 60.000 ms equivale a < 3.33 ms/partita; 400 partite devono completarsi ampiamente sotto 15s (incluso avvio worker)
      expect(elapsedMs).toBeLessThan(15000);
    },
    30000,
  );
});
