// GDD §2.1, §3.2, TECH-SPEC §4.1, §4.2
// Algoritmo PRNG deterministico: hash del seed tramite xmur3 e generatore a 32 bit sfc32.
// Mescolamento puro Fisher-Yates da n - 1 a 1 con j = floor(rng() * (i + 1)).

export type RngState = [number, number, number, number];

/**
 * Funzione di hash xmur3 per derivare lo stato iniziale a 32 bit da una stringa seed.
 * Restituisce un generatore di interi unsigned a 32 bit per inizializzare sfc32.
 */
export function xmur3(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (): number => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/**
 * Converte una stringa seed nella tupla immutabile di 4 interi unsigned a 32 bit per sfc32.
 */
export function seedToRngState(seed: string): RngState {
  const hash = xmur3(seed);
  return [hash(), hash(), hash(), hash()];
}

/**
 * Singolo passo puro del generatore sfc32 (Simple Fast Counter 32-bit).
 * Non muta la tupla di stato in ingresso; restituisce un float in [0, 1) e il nuovo RngState.
 */
export function nextRandom(state: Readonly<RngState>): {
  value: number;
  nextState: RngState;
} {
  let a = state[0] >>> 0;
  let b = state[1] >>> 0;
  let c = state[2] >>> 0;
  let d = state[3] >>> 0;

  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;

  const value = (t >>> 0) / 4294967296;
  return {
    value,
    nextState: [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
  };
}

/**
 * Restituisce un intero uniforme in [0, maxExclusive) avanzando in modo puro lo stato PRNG.
 */
export function nextInt(
  state: Readonly<RngState>,
  maxExclusive: number,
): {
  value: number;
  nextState: RngState;
} {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError(
      `maxExclusive must be a positive integer, got ${String(maxExclusive)}.`,
    );
  }
  const step = nextRandom(state);
  return {
    value: Math.floor(step.value * maxExclusive),
    nextState: step.nextState,
  };
}

/**
 * Mescolamento puro Fisher-Yates (GDD §2.1, TECH-SPEC §4.2):
 * itera da i = n - 1 fino a 1, estraendo j = floor(rng() * (i + 1)).
 * Non muta mai l'array originale né la tupla rngState in ingresso.
 */
export function shuffle<T>(
  items: readonly T[],
  state: Readonly<RngState>,
): {
  items: T[];
  nextState: RngState;
} {
  const result = items.slice();
  let currentState: RngState = [
    state[0] >>> 0,
    state[1] >>> 0,
    state[2] >>> 0,
    state[3] >>> 0,
  ];

  for (let i = result.length - 1; i >= 1; i--) {
    const step = nextRandom(currentState);
    currentState = step.nextState;
    const j = Math.floor(step.value * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }

  return {
    items: result,
    nextState: currentState,
  };
}

/**
 * Crea un wrapper stateful attorno a sfc32 (utile per bot e simulatore).
 */
export function createSfc32(seedOrState: string | Readonly<RngState>): {
  next: () => number;
  getState: () => RngState;
} {
  let currentState: RngState =
    typeof seedOrState === 'string'
      ? seedToRngState(seedOrState)
      : [
          seedOrState[0] >>> 0,
          seedOrState[1] >>> 0,
          seedOrState[2] >>> 0,
          seedOrState[3] >>> 0,
        ];

  return {
    next(): number {
      const step = nextRandom(currentState);
      currentState = step.nextState;
      return step.value;
    },
    getState(): RngState {
      return [
        currentState[0],
        currentState[1],
        currentState[2],
        currentState[3],
      ];
    },
  };
}
