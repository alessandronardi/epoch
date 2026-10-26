import { describe, expect, it } from 'vitest';
import {
  createSfc32,
  nextInt,
  nextRandom,
  seedToRngState,
  shuffle,
  xmur3,
} from '../src/rng.js';
import { canonicalizeJson, sha256Hex, stateHash } from '../src/hash.js';
import { DEFAULT_RULES_CONFIG, type GameState } from '../src/types.js';

function createDummyGameState(seed = 'epochs-test-seed'): GameState {
  const rngState = seedToRngState(seed);
  return {
    schemaVersion: 1,
    rulesetVersion: '1.0',
    catalogVersion: '1.0',
    stateVersion: 0,
    rules: DEFAULT_RULES_CONFIG,
    catalog: {},
    seed,
    rngState,
    era: 1,
    phase: 'mulligan',
    cycle: 0,
    initiative: 'P1',
    toAct: null,
    players: {
      P1: {
        hand: [],
        subdecks: { 1: [], 2: [], 3: [] },
        discard: [],
        publicDiscard: [],
        resources: { food: 2, wood: 2, metal: 0 },
        buildings: [],
        units: [],
        slotsUsed: 0,
        passed: false,
        walls: 6,
        cityMax: 10,
        cityDamage: 0,
        demBonus: 0,
        mulliganDone: false,
        consecutiveTimeouts: 0,
      },
      P2: {
        hand: [],
        subdecks: { 1: [], 2: [], 3: [] },
        discard: [],
        publicDiscard: [],
        resources: { food: 2, wood: 2, metal: 0 },
        buildings: [],
        units: [],
        slotsUsed: 0,
        passed: false,
        walls: 6,
        cityMax: 10,
        cityDamage: 0,
        demBonus: 0,
        mulliganDone: false,
        consecutiveTimeouts: 0,
      },
    },
    pending: {},
    counters: { uid: 0, drawnOrder: 0, seq: 0, event: 0 },
    result: null,
  };
}

describe('PRNG (xmur3 + sfc32) and Fisher-Yates shuffle', () => {
  it('produces deterministic 32-bit unsigned tuples from xmur3 and seedToRngState', () => {
    const stateA = seedToRngState('epochs-seed-alpha');
    const stateB = seedToRngState('epochs-seed-alpha');
    const stateC = seedToRngState('epochs-seed-beta');

    expect(stateA).toEqual(stateB);
    expect(stateA).not.toEqual(stateC);
    for (const word of stateA) {
      expect(Number.isInteger(word)).toBe(true);
      expect(word).toBeGreaterThanOrEqual(0);
      expect(word).toBeLessThanOrEqual(0xffffffff);
    }

    const gen = xmur3('epochs-seed-alpha');
    expect([gen(), gen(), gen(), gen()]).toEqual(stateA);
  });

  it('advances sfc32 immutably and produces reproducible values in [0, 1)', () => {
    const initial = seedToRngState('determinism-check');
    const frozen = Object.freeze([...initial]) as typeof initial;

    let s1 = frozen;
    let s2 = seedToRngState('determinism-check');
    const seq1: number[] = [];
    const seq2: number[] = [];

    for (let i = 0; i < 100; i++) {
      const r1 = nextRandom(s1);
      const r2 = nextRandom(s2);
      expect(r1.value).toBeGreaterThanOrEqual(0);
      expect(r1.value).toBeLessThan(1);
      seq1.push(r1.value);
      seq2.push(r2.value);
      s1 = r1.nextState;
      s2 = r2.nextState;
    }

    expect(seq1).toEqual(seq2);
    expect(s1).toEqual(s2);
    expect(frozen).toEqual(seedToRngState('determinism-check'));
  });

  it('supports nextInt and createSfc32 wrapper consistently with nextRandom', () => {
    const seed = 'wrapper-test';
    const wrapper = createSfc32(seed);
    let pureState = seedToRngState(seed);

    for (let i = 0; i < 20; i++) {
      const step = nextRandom(pureState);
      pureState = step.nextState;
      expect(wrapper.next()).toBe(step.value);
    }
    expect(wrapper.getState()).toEqual(pureState);

    const wrapperFromTuple = createSfc32(pureState);
    const intStep = nextInt(pureState, 10);
    expect(intStep.value).toBeGreaterThanOrEqual(0);
    expect(intStep.value).toBeLessThan(10);
    expect(Math.floor(wrapperFromTuple.next() * 10)).toBe(intStep.value);

    expect(() => nextInt(pureState, 0)).toThrow(RangeError);
    expect(() => nextInt(pureState, -3)).toThrow(RangeError);
  });

  it('shuffles arrays purely with Fisher-Yates from n - 1 down to 1', () => {
    const original = Array.from({ length: 20 }, (_, i) => `card_${i + 1}`);
    const frozenOriginal = Object.freeze(original.slice());
    const initialRng = Object.freeze(seedToRngState('subdeck-era-1'));

    const res1 = shuffle(frozenOriginal, initialRng);
    const res2 = shuffle(frozenOriginal, initialRng);
    const resDiff = shuffle(frozenOriginal, seedToRngState('subdeck-era-2'));

    expect(res1.items).toEqual(res2.items);
    expect(res1.nextState).toEqual(res2.nextState);
    expect(res1.items).not.toEqual(original);
    expect(res1.items).not.toEqual(resDiff.items);
    expect([...res1.items].sort()).toEqual([...original].sort());

    // Empty and single-element arrays do not consume RNG steps
    const emptyRes = shuffle([], initialRng);
    expect(emptyRes.items).toEqual([]);
    expect(emptyRes.nextState).toEqual(initialRng);

    const singleRes = shuffle(['only_one'], initialRng);
    expect(singleRes.items).toEqual(['only_one']);
    expect(singleRes.nextState).toEqual(initialRng);
  });
});

describe('Canonical JSON and pure SHA-256 stateHash', () => {
  it('matches standard FIPS 180-4 SHA-256 test vectors including UTF-8 multibyte strings', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(
      sha256Hex(
        'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      ),
    ).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    // Multibyte UTF-8 characters (2-byte, 3-byte, and 4-byte astral plane emoji)
    expect(sha256Hex('Città — 🍖🪵⛏️')).toHaveLength(64);
    expect(sha256Hex('Città — 🍖🪵⛏️')).toBe(sha256Hex('Città — 🍖🪵⛏️'));
  });

  it('produces identical canonical JSON and stateHash regardless of object property insertion order', () => {
    const objA = {
      z: 1,
      a: { d: 'hello', b: [3, 2, 1], c: null, omitted: undefined },
      m: true,
    };
    const objB = {
      m: true,
      a: { b: [3, 2, 1], c: null, d: 'hello' },
      z: 1,
    };

    expect(canonicalizeJson(objA)).toBe(canonicalizeJson(objB));
    expect(canonicalizeJson(objA)).toBe(
      '{"a":{"b":[3,2,1],"c":null,"d":"hello"},"m":true,"z":1}',
    );

    const state1 = createDummyGameState('seed-123');
    const state2 = JSON.parse(JSON.stringify(state1)) as GameState;
    // Rebuild players object with reversed key insertion order
    state2.players = {
      P2: state2.players.P2,
      P1: state2.players.P1,
    };

    expect(stateHash(state1)).toBe(stateHash(state2));
    expect(stateHash(state1)).toMatch(/^[0-9a-f]{64}$/);

    state2.stateVersion = 1;
    expect(stateHash(state1)).not.toBe(stateHash(state2));
  });
});
