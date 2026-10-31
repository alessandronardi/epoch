import { describe, expect, it } from 'vitest';
import { createGame, apply, stateHash, playerView } from '@epochs/engine';
import { getCatalog } from '@epochs/content';
import { CIVILIZATION_PRESETS, LEGACY_PRESETS } from '../../../packages/content/src/presets.js';
import { SqliteRepository } from '../src/db/sqlite-repository.js';
import {
  reconstructGameReplay,
  projectViewForReplayPerspective,
  projectEventsForReplayPerspective,
} from '../src/routes/replay-and-decks.js';
import { ReplayPayloadSchema, PlayerViewSchema, GameEventSchema } from '@epochs/protocol';

describe('Civilization persistence and replay compatibility', () => {
  it.each(['1.0', '2.0'] as const)(
    'round trips persisted %s and replays with its original catalog',
    (version) => {
      const repo = new SqliteRepository(':memory:');
      try {
        for (const id of ['a', 'b']) repo.createPlayer({ id, tokenHash: id, nickname: id });
        const presets = version === '1.0' ? LEGACY_PRESETS : CIVILIZATION_PRESETS;
        const deck = presets[0]!;
        repo.saveDeck({ id: 'deck', playerId: 'a', name: deck.name, payload: deck });
        expect(repo.getDeckById('deck')?.catalogVersion).toBe(version);
        expect(repo.getDeckById('deck')?.payload).toEqual(deck);
        const { state } = createGame({
          seed: 'persist-v2',
          catalog: { ...getCatalog(version).rulesById },
          decks: { P1: deck, P2: presets[2]! },
        });
        repo.createGameRecord({
          id: 'match',
          seed: state.seed,
          rules: state.rules,
          state,
          stateHash: stateHash(state),
          p1Id: 'a',
          p2Id: 'b',
        });
        const result = apply(state, { type: 'Concede', player: 'P1' });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const next = result.value.state;
        repo.saveTransition(
          {
            gameId: 'match',
            status: 'FINISHED',
            stateVersion: next.stateVersion,
            eventN: next.counters.event,
            state: next,
            stateHash: stateHash(next),
            result: next.result,
          },
          {
            gameId: 'match',
            idx: 0,
            commandId: 'end',
            player: 'P1',
            expectedVersion: 0,
            resultingVersion: 1,
            command: { type: 'Concede' },
            stateHash: stateHash(next),
            createdAt: 1,
          },
        );
        const record = repo.getGameById('match')!;
        const replay = reconstructGameReplay(
          record,
          repo.listCommandsByGame('match'),
          'P1',
          getCatalog(version === '1.0' ? '2.0' : '1.0').rulesById,
        );
        expect(ReplayPayloadSchema.parse(replay)).toEqual(replay);
        expect(replay.steps.at(-1)?.view).toEqual(playerView(next, 'P1'));
      } finally {
        repo.close();
      }
    },
  );
  it('redacts private organization and market details in public replay', () => {
    const { state } = createGame({
      seed: 'privacy',
      catalog: { ...getCatalog('2.0').rulesById },
      decks: { P1: CIVILIZATION_PRESETS[0]!, P2: CIVILIZATION_PRESETS[1]! },
    });
    state.players.P1.organizationUsed = true;
    const view = projectViewForReplayPerspective(state, 'public');
    expect(view.self.organizationUsed).toBe(false);
    expect(PlayerViewSchema.parse(view)).toEqual(view);
    const events = projectEventsForReplayPerspective(
      [
        {
          n: 1,
          type: 'MarketActivated',
          player: 'P1',
          structureUid: 'm',
          give: 'food',
          receive: 'metal',
        },
      ],
      'public',
    );
    expect(events[0]).not.toHaveProperty('give');
    expect(GameEventSchema.parse(events[0])).toEqual(events[0]);
  });
});
