// @vitest-environment jsdom
import type { BattlePhaseId, GameEvent } from '@epochs/engine';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioControls } from '../src/audio/AudioControls.js';
import {
  AUDIO_PREFERENCES_KEY,
  connectGameAudio,
  createSoundEffects,
  getEventSound,
} from '../src/audio/sound-effects.js';
import { createGameStore, DEFAULT_EVENT_STEP_MS } from '../src/state/game-store.js';

const card: GameEvent = { n: 1, type: 'CardPlayed', player: 'P1', slotsUsed: 1, coveredCount: 1 };
const pass: GameEvent = {
  n: 2,
  type: 'PlayerPassed',
  player: 'P2',
  era: 1,
  cycle: 1,
  reason: 'chosen',
};
const reveal: GameEvent = {
  n: 3,
  type: 'UnitsRevealed',
  era: 1,
  units: { P1: [], P2: [] },
  resources: { P1: { food: 0, wood: 0, metal: 0 }, P2: { food: 0, wood: 0, metal: 0 } },
};
const siege: Extract<GameEvent, { type: 'SiegeResolved' }> = {
  n: 8,
  type: 'SiegeResolved',
  era: 1,
  attacker: 'P1',
  defender: 'P2',
  D: 8,
  W: 6,
  breach: true,
  wallsAfter: 0,
  directDamage: 2,
  cityHpAfter: 8,
};
const end: GameEvent = { n: 9, type: 'GameEnded', winner: 'P1', kind: 'concession' };

function battle(phase: BattlePhaseId, n = 4): GameEvent {
  return {
    n,
    type: 'BattlePhaseResolved',
    era: 1,
    phase,
    damageDealt: { P1: 1, P2: 1 },
    assignments: { P1: [], P2: [] },
    casualties: { P1: [], P2: [] },
  };
}

function audioParam() {
  return {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}
function gainNode() {
  return { gain: audioParam(), connect: vi.fn(), disconnect: vi.fn() };
}
function oscillatorNode() {
  return {
    type: 'sine',
    frequency: audioParam(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };
}
function fakeContext(initialState: AudioContextState = 'running') {
  const gains: ReturnType<typeof gainNode>[] = [];
  const oscillators: ReturnType<typeof oscillatorNode>[] = [];
  const context = {
    currentTime: 10,
    state: initialState,
    destination: {},
    createGain: vi.fn(() => {
      const node = gainNode();
      gains.push(node);
      return node;
    }),
    createOscillator: vi.fn(() => {
      const node = oscillatorNode();
      oscillators.push(node);
      return node;
    }),
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    close: vi.fn(async () => {
      context.state = 'closed';
    }),
  };
  const factory = vi.fn(() => context as unknown as AudioContext);
  return { context, factory, gains, oscillators };
}
function memoryStorage(value: string | null = null) {
  let stored = value;
  return {
    getItem: vi.fn(() => stored),
    setItem: vi.fn((_key: string, next: string) => {
      stored = next;
    }),
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('procedural sound effects', () => {
  it('synthesizes nine distinct cues with bounded gain, timed envelopes and automatic disconnection', async () => {
    const fake = fakeContext();
    const audio = createSoundEffects({ storage: null, createAudioContext: fake.factory });
    expect(fake.factory).not.toHaveBeenCalled();
    audio.playEvent(card);
    expect(fake.factory).not.toHaveBeenCalled();
    await audio.unlock();
    await audio.unlock();
    expect(fake.factory).toHaveBeenCalledTimes(1);
    const events = [
      card,
      pass,
      reveal,
      battle('phase1_volley'),
      battle('phase2a_impale'),
      battle('phase2b_impact'),
      battle('phase3_melee'),
      siege,
      end,
    ];
    expect(new Set(events.map(getEventSound)).size).toBe(9);
    const signatures = events.map((event) => {
      const offset = fake.oscillators.length;
      audio.playEvent(event);
      const notes = fake.oscillators.slice(offset);
      expect(notes.length).toBeGreaterThan(0);
      return JSON.stringify(
        notes.map((node) => {
          expect(node.start).toHaveBeenCalledOnce();
          expect(node.stop.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(10);
          const signature = [
            node.type,
            node.frequency.setValueAtTime.mock.calls,
            node.start.mock.calls,
            node.stop.mock.calls,
          ];
          node.onended?.();
          expect(node.disconnect).toHaveBeenCalledOnce();
          return signature;
        }),
      );
    });
    expect(new Set(signatures).size).toBe(9);
    for (const envelope of fake.gains.slice(1)) {
      expect(envelope.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
      expect(envelope.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
        0.0001,
        expect.any(Number),
      );
      expect(envelope.gain.linearRampToValueAtTime.mock.calls[0]?.[0]).toBeLessThanOrEqual(0.12);
      expect(envelope.disconnect).toHaveBeenCalledOnce();
    }
    audio.dispose();
    expect(fake.context.close).toHaveBeenCalledOnce();
    await audio.unlock();
    audio.playEvent(card);
    expect(fake.factory).toHaveBeenCalledTimes(1);
  });

  it('uses projected card events and conversion/instant cues without sounding unrelated events or failed breaches', () => {
    expect(getEventSound(card)).toBe('card'); // Nessun cardId necessario per la carta coperta avversaria.
    expect(
      getEventSound({
        n: 1,
        type: 'ConversionActivated',
        player: 'P1',
        uid: 'c',
        cardId: 'e3_frn',
        gain: { food: 0, wood: 0, metal: 3 },
        demBonusGained: 1,
        coveredCount: 0,
      }),
    ).toBe('card');
    expect(
      getEventSound({
        n: 1,
        type: 'InstantsRevealed',
        era: 1,
        played: { P1: [{ uid: 'i', cardId: 'i1_rally' }], P2: [] },
      }),
    ).toBe('card');
    expect(
      getEventSound({ n: 1, type: 'InstantsRevealed', era: 1, played: { P1: [], P2: [] } }),
    ).toBeNull();
    expect(getEventSound({ ...siege, breach: false })).toBeNull();
    expect(getEventSound({ n: 1, type: 'BattleStarted', era: 1 })).toBeNull();
  });

  it('resumes on a gesture, drops events while suspended and retries a denied resume without queued audio', async () => {
    const fake = fakeContext('suspended');
    fake.context.resume.mockRejectedValueOnce(new Error('autoplay blocked'));
    const audio = createSoundEffects({ storage: null, createAudioContext: fake.factory });
    await expect(audio.unlock()).resolves.toBeUndefined();
    audio.playEvent(card);
    expect(fake.oscillators).toHaveLength(0);
    await audio.unlock();
    expect(fake.oscillators).toHaveLength(0);
    audio.playEvent(card);
    expect(fake.oscillators).toHaveLength(1);
    expect(fake.context.resume).toHaveBeenCalledTimes(2);
    audio.dispose();
  });

  it('stays usable without AudioContext, outside a browser, or when the constructor fails', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const unsupported = createSoundEffects({ storage: null });
    await expect(unsupported.unlock()).resolves.toBeUndefined();
    expect(() => unsupported.playEvent(card)).not.toThrow();
    vi.stubGlobal('window', undefined);
    const server = createSoundEffects();
    await expect(server.unlock()).resolves.toBeUndefined();
    server.setMuted(true);
    const broken = createSoundEffects({
      storage: null,
      createAudioContext: () => {
        throw new Error('device unavailable');
      },
    });
    await expect(broken.unlock()).resolves.toBeUndefined();
    expect(() => broken.playEvent(card)).not.toThrow();
  });

  it('persists mute/volume, clamps values, updates active gain and silences scheduled notes immediately', async () => {
    const storage = memoryStorage();
    const fake = fakeContext();
    const audio = createSoundEffects({ storage, createAudioContext: fake.factory });
    const changed = vi.fn();
    const unsubscribe = audio.subscribe(changed);
    await audio.unlock();
    audio.playEvent(end);
    audio.setVolume(0.6);
    expect(fake.gains[0]?.gain.setValueAtTime).toHaveBeenLastCalledWith(0.6, 10);
    audio.setMuted(true);
    for (const oscillator of fake.oscillators) {
      expect(oscillator.stop).toHaveBeenLastCalledWith();
      expect(oscillator.disconnect).toHaveBeenCalledOnce();
    }
    audio.playEvent(card);
    expect(fake.oscillators).toHaveLength(3);
    expect(createSoundEffects({ storage }).getPreferences()).toEqual({ muted: true, volume: 0.6 });
    expect(storage.setItem).toHaveBeenLastCalledWith(
      AUDIO_PREFERENCES_KEY,
      JSON.stringify({ muted: true, volume: 0.6 }),
    );
    audio.setVolume(10);
    expect(audio.getPreferences().volume).toBe(1);
    audio.setVolume(-10);
    expect(audio.getPreferences().volume).toBe(0);
    const beforeInvalid = audio.getPreferences();
    audio.setVolume(Number.NaN);
    audio.setVolume(Number.POSITIVE_INFINITY);
    expect(audio.getPreferences()).toBe(beforeInvalid);
    expect(changed).toHaveBeenCalledTimes(4);
    unsubscribe();
    audio.setMuted(false);
    audio.playEvent(card);
    expect(changed).toHaveBeenCalledTimes(4);
    expect(fake.oscillators).toHaveLength(3);
    audio.dispose();
  });

  it.each(['invalid json', 'null', '[]', '{"muted":"false","volume":"loud"}'])(
    'recovers from malformed preferences: %s',
    (stored) => {
      expect(createSoundEffects({ storage: memoryStorage(stored) }).getPreferences()).toEqual({
        muted: false,
        volume: 0.35,
      });
    },
  );

  it('tolerates denied storage and restores valid preferences without creating an audio context', async () => {
    const storage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const audio = createSoundEffects({ storage });
    expect(() => {
      audio.setVolume(0.7);
      audio.setMuted(true);
    }).not.toThrow();
    const fake = fakeContext();
    const restored = createSoundEffects({
      storage: memoryStorage('{"muted":true,"volume":2}'),
      createAudioContext: fake.factory,
    });
    expect(restored.getPreferences()).toEqual({ muted: true, volume: 1 });
    await restored.unlock();
    expect(fake.factory).not.toHaveBeenCalled();
  });

  it('scales audio timing at 2x and releases voices after synthesis errors', async () => {
    const fake = fakeContext();
    const audio = createSoundEffects({ storage: null, createAudioContext: fake.factory });
    await audio.unlock();
    audio.playEvent(card, 2);
    expect(fake.oscillators[0]?.stop).toHaveBeenCalledWith(10 + 0.09 / 2);
    fake.context.createOscillator.mockImplementationOnce(() => {
      throw new Error('audio limit');
    });
    expect(() => audio.playEvent(pass)).not.toThrow();
    expect(fake.oscillators[0]?.disconnect).toHaveBeenCalledOnce();
    audio.dispose();
  });
});

describe('EventPlayer and controls integration', () => {
  it('lets the final cue decay naturally, but stops it on reset and disconnect', () => {
    vi.useFakeTimers();
    const store = createGameStore();
    const audio = createSoundEffects({ storage: null });
    const play = vi.spyOn(audio, 'playEvent');
    const stop = vi.spyOn(audio, 'stop');
    const disconnect = connectGameAudio(store, audio);
    store.getState().enqueueEvents([end]);
    vi.runAllTimers();
    expect(play).toHaveBeenCalledExactlyOnceWith(end, 1);
    expect(stop).not.toHaveBeenCalled();
    store.getState().resetStore();
    expect(stop).toHaveBeenCalledOnce();
    disconnect();
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('sounds events only when displayed, respects pause/speed, ignores duplicates and skips queued sounds', () => {
    vi.useFakeTimers();
    const store = createGameStore();
    const audio = createSoundEffects({ storage: null });
    const play = vi.spyOn(audio, 'playEvent');
    const stop = vi.spyOn(audio, 'stop');
    const disconnect = connectGameAudio(store, audio);
    store.getState().enqueueEvents([card, pass]);
    expect(play).toHaveBeenCalledExactlyOnceWith(card, 1);
    store.getState().setSelectedHandUid('x');
    store.getState().enqueueEvents([card, pass]);
    expect(play).toHaveBeenCalledTimes(1);
    store.getState().pausePlayback();
    expect(stop).toHaveBeenCalled();
    vi.advanceTimersByTime(DEFAULT_EVENT_STEP_MS * 2);
    expect(play).toHaveBeenCalledTimes(1);
    store.getState().setPlaybackSpeed(2);
    store.getState().resumePlayback();
    vi.advanceTimersByTime(DEFAULT_EVENT_STEP_MS / 2);
    expect(play).toHaveBeenLastCalledWith(pass, 2);
    store.getState().enqueueEvents([siege, end]);
    store.getState().skipToEnd();
    expect(play).toHaveBeenCalledTimes(2);
    disconnect();
    store.getState().enqueueEvents([{ ...card, n: 20 }]);
    expect(play).toHaveBeenCalledTimes(2);
    store.getState().resetStore();
  });

  it('exposes keyboard accessible mute and volume controls that restore persisted preferences', () => {
    const storage = memoryStorage('{"muted":true,"volume":0.2}');
    const audio = createSoundEffects({ storage });
    render(createElement(AudioControls, { audio }));
    const mute = screen.getByRole('button', { name: 'Silenzia audio' });
    const volume = screen.getByRole('slider', { name: 'Volume' });
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    expect(volume.getAttribute('aria-valuetext')).toBe('20%');
    fireEvent.click(mute);
    expect(mute.getAttribute('aria-pressed')).toBe('false');
    fireEvent.change(volume, { target: { value: '65' } });
    expect(volume.getAttribute('aria-valuetext')).toBe('65%');
    expect(createSoundEffects({ storage }).getPreferences()).toEqual({
      muted: false,
      volume: 0.65,
    });
  });
});
