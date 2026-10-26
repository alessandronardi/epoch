import aggroBreachDeckJson from '../../../data/decks/aggro-breach.json' with { type: 'json' };
import balancedTacticalDeckJson from '../../../data/decks/balanced-tactical.json' with { type: 'json' };
import boomEconomyDeckJson from '../../../data/decks/boom-economy.json' with { type: 'json' };
import { GreedyBot, RandomBot } from '@epochs/bots';
import { CARDS_RULES } from '@epochs/content';
import {
  createSfc32,
  type DeckPayload,
  type PlayerView,
} from '@epochs/engine';
import { describe, expect, it } from 'vitest';
import { LocalGameController } from '../src/controllers/local-controller.js';
import type { ProjectionNotification } from '../src/controllers/types.js';
import { createGameStore } from '../src/state/game-store.js';

const AGGRO_DECK = aggroBreachDeckJson as DeckPayload;
const BALANCED_DECK = balancedTacticalDeckJson as DeckPayload;
const BOOM_DECK = boomEconomyDeckJson as DeckPayload;

function assertPurePlayerView(view: PlayerView): void {
  // Verifica che lo stato nello store sia unicamente PlayerView e non esponga mai campi interni di GameState
  const rawRecord = view as unknown as Record<string, unknown>;
  expect(rawRecord['players']).toBeUndefined();
  expect(rawRecord['rng']).toBeUndefined();
  expect(rawRecord['pending']).toBeUndefined();
  expect(rawRecord['counters']).toBeUndefined();
  expect(rawRecord['rules']).toBeUndefined();

  if (
    view.phase === 'mulligan' ||
    view.phase === 'hand_limit' ||
    view.phase === 'development'
  ) {
    expect(view.opponent.resources).toBeNull();
    expect(view.opponent.units).toBeNull();
  }
}

describe('LocalGameController (M3-06)', () => {
  it('completes a full match vs GreedyBot from mulligan to finished while emitting only projected PlayerViews and redacted events', () => {
    const store = createGameStore();
    const notifications: ProjectionNotification[] = [];

    const controller = new LocalGameController({
      mode: 'bot',
      seed: 'm3-06-vs-bot-match',
      catalog: CARDS_RULES,
      decks: {
        P1: AGGRO_DECK,
        P2: BOOM_DECK,
      },
      humanPlayer: 'P1',
      botKind: 'greedy',
      store,
      onProjectionEmitted: (notification) => {
        notifications.push(notification);
      },
    });

    const humanBot = new GreedyBot({ catalog: CARDS_RULES });
    const humanPrng = createSfc32('m3-06-human-driver');

    const initialView = controller.startMatch();
    expect(initialView.me).toBe('P1');
    expect(initialView.phase).toBe('mulligan');
    // Il bot (P2) ha già confermato la propria scelta di mulligan in automatico
    expect(initialView.opponent.committed).toBe(true);
    assertPurePlayerView(initialView);

    let steps = 0;
    while (
      store.getState().view !== null &&
      store.getState().view!.phase !== 'finished' &&
      steps < 400
    ) {
      const currentView = store.getState().view!;
      assertPurePlayerView(currentView);
      expect(currentView.me).toBe('P1');
      expect(currentView.self.legal.canAct).toBe(true);

      const move = humanBot.choose(currentView, humanPrng.next);
      const result = controller.dispatch(move);
      expect(result.ok).toBe(true);
      steps += 1;
    }

    const finalView = store.getState().view!;
    expect(finalView.phase).toBe('finished');
    expect(finalView.result).not.toBeNull();
    expect(notifications.length).toBeGreaterThan(5);

    // Verifica anti-leak su tutte le notifiche ricevute dallo store
    for (const item of notifications) {
      expect(item.viewer).toBe('P1');
      assertPurePlayerView(item.view);
      for (const ev of item.events) {
        if (ev.type === 'CardPlayed' && ev.player === 'P2') {
          expect(ev.cardId).toBeUndefined();
          expect(ev.uid).toBeUndefined();
          expect(ev.cardType).toBeUndefined();
        }
        if (ev.type === 'CardsDrawn' && ev.player === 'P2') {
          expect(ev.cards).toBeUndefined();
        }
        if (ev.type === 'HandLimitDiscarded' && ev.player === 'P2') {
          expect(ev.cardUids).toBeUndefined();
        }
      }
    }

    store.getState().skipToEnd();
    controller.dispose();
  });

  it('completes a full Hot-Seat match with privacy handover lock on every seat change', () => {
    const store = createGameStore();
    const handoverTransitions: Array<{ from: string; to: string; phase: string }> =
      [];

    const controller = new LocalGameController({
      mode: 'hotseat',
      seed: 'm3-06-hotseat-match',
      catalog: CARDS_RULES,
      decks: {
        P1: BALANCED_DECK,
        P2: AGGRO_DECK,
      },
      fixedInitiative: 'P1',
      store,
    });

    const p1Policy = new RandomBot({ passProbability: 0.25 });
    const p2Policy = new GreedyBot({ catalog: CARDS_RULES });
    const hotSeatPrng = createSfc32('m3-06-hotseat-rng');

    const startView = controller.startMatch();
    expect(startView.me).toBe('P1');
    expect(startView.phase).toBe('mulligan');
    expect(store.getState().awaitingHotSeatHandover).toBe(false);

    let steps = 0;
    while (
      store.getState().view !== null &&
      store.getState().view!.phase !== 'finished' &&
      steps < 500
    ) {
      const currentView = store.getState().view!;
      const actingPlayer = controller.getCurrentViewer();
      expect(currentView.me).toBe(actingPlayer);
      assertPurePlayerView(currentView);

      if (store.getState().awaitingHotSeatHandover) {
        expect(store.getState().hotSeatNextPlayer).toBe(actingPlayer);
        controller.acknowledgeHotSeatHandover();
        expect(store.getState().awaitingHotSeatHandover).toBe(false);
        expect(store.getState().hotSeatNextPlayer).toBeNull();
      }

      const policy = actingPlayer === 'P1' ? p1Policy : p2Policy;
      const move = policy.choose(currentView, hotSeatPrng.next);
      const res = controller.dispatch(move);
      expect(res.ok).toBe(true);

      const nextViewer = controller.getCurrentViewer();
      const nextPhase = store.getState().view!.phase;
      if (nextPhase !== 'finished' && nextViewer !== actingPlayer) {
        expect(store.getState().awaitingHotSeatHandover).toBe(true);
        expect(store.getState().hotSeatNextPlayer).toBe(nextViewer);
        handoverTransitions.push({
          from: actingPlayer,
          to: nextViewer,
          phase: nextPhase,
        });
      }

      steps += 1;
    }

    const endView = store.getState().view!;
    expect(endView.phase).toBe('finished');
    expect(endView.result).not.toBeNull();
    expect(store.getState().awaitingHotSeatHandover).toBe(false);
    // Verifica che siano avvenuti molteplici passaggi di dispositivo P1 <-> P2
    expect(handoverTransitions.length).toBeGreaterThan(6);
    expect(
      handoverTransitions.some((t) => t.from === 'P1' && t.to === 'P2'),
    ).toBe(true);
    expect(
      handoverTransitions.some((t) => t.from === 'P2' && t.to === 'P1'),
    ).toBe(true);

    store.getState().skipToEnd();
    controller.dispose();
  });

  it('records RuleError on illegal commands without mutating state and supports concede()', () => {
    const store = createGameStore();
    const controller = new LocalGameController({
      mode: 'bot',
      seed: 'm3-06-errors-and-concede',
      catalog: CARDS_RULES,
      decks: {
        P1: BALANCED_DECK,
        P2: BALANCED_DECK,
      },
      store,
    });

    // Prima di startMatch qualsiasi dispatch restituisce errore
    const beforeStart = controller.dispatch({ type: 'Pass' });
    expect(beforeStart.ok).toBe(false);
    expect(store.getState().lastError?.code).toBe('INVALID_PHASE');

    const initialView = controller.startMatch();
    expect(initialView.phase).toBe('mulligan');

    // In mulligan non è consentito inviare Pass
    const badMove = controller.dispatch({ type: 'Pass' });
    expect(badMove.ok).toBe(false);
    if (!badMove.ok) {
      expect(badMove.error.code).toBe('INVALID_PHASE');
    }
    expect(store.getState().view?.stateVersion).toBe(initialView.stateVersion);

    // Concede termina immediatamente la partita con vittoria dell'avversario
    const conceded = controller.concede();
    expect(conceded.ok).toBe(true);
    if (conceded.ok) {
      expect(conceded.value.phase).toBe('finished');
      expect(conceded.value.result?.kind).toBe('concession');
      expect(conceded.value.result?.winner).toBe('P2');
    }

    store.getState().skipToEnd();
    controller.dispose();
  });
});
