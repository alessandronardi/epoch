// TECH-SPEC §12 M7 — feedback procedurale sugli eventi già proiettati dal client.
import type { GameEvent } from '@epochs/engine';
import type { GameStoreApi } from '../state/game-store.js';

export const AUDIO_PREFERENCES_KEY = 'epochs.audio-preferences.v1';
export interface AudioPreferences {
  readonly muted: boolean;
  readonly volume: number;
}

type SoundId =
  'card' | 'pass' | 'reveal' | 'volley' | 'impale' | 'flank' | 'melee' | 'breach' | 'end';
type Tone = readonly [
  frequency: number,
  endFrequency: number,
  offset: number,
  duration: number,
  wave: OscillatorType,
];

// Brevi inviluppi e timbri distinti; nessun asset audio né generatore casuale.
const SOUNDS: Record<SoundId, readonly Tone[]> = {
  card: [[520, 320, 0, 0.09, 'triangle']],
  pass: [[280, 180, 0, 0.14, 'sine']],
  reveal: [
    [392, 392, 0, 0.12, 'sine'],
    [587, 587, 0.08, 0.16, 'sine'],
  ],
  volley: [
    [1500, 480, 0, 0.1, 'triangle'],
    [1250, 400, 0.08, 0.1, 'triangle'],
  ],
  impale: [[180, 75, 0, 0.18, 'square']],
  flank: [
    [330, 660, 0, 0.12, 'triangle'],
    [440, 880, 0.1, 0.12, 'triangle'],
  ],
  melee: [
    [130, 55, 0, 0.1, 'sawtooth'],
    [160, 65, 0.09, 0.13, 'triangle'],
  ],
  breach: [
    [90, 30, 0, 0.32, 'sawtooth'],
    [190, 45, 0.06, 0.25, 'triangle'],
  ],
  end: [
    [392, 392, 0, 0.18, 'sine'],
    [494, 494, 0.12, 0.18, 'sine'],
    [587, 587, 0.24, 0.26, 'sine'],
  ],
};

export function getEventSound(event: GameEvent): SoundId | null {
  switch (event.type) {
    case 'CardPlayed':
    case 'ConversionActivated':
      return 'card';
    case 'InstantsRevealed':
      return event.played.P1.length + event.played.P2.length > 0 ? 'card' : null;
    case 'PlayerPassed':
      return 'pass';
    case 'UnitsRevealed':
      return 'reveal';
    case 'BattlePhaseResolved':
      switch (event.phase) {
        case 'phase1_volley':
          return 'volley';
        case 'phase2a_impale':
          return 'impale';
        case 'phase2b_impact':
          return 'flank';
        case 'phase3_melee':
          return 'melee';
      }
      break;
    case 'SiegeResolved':
      return event.breach ? 'breach' : null;
    case 'GameEnded':
      return 'end';
    default:
      return null;
  }
}

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
interface SoundEffectsOptions {
  readonly storage?: PreferenceStorage | null;
  readonly createAudioContext?: () => AudioContext | null;
}

function browserStorage(): PreferenceStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function browserAudioContext(): AudioContext | null {
  return typeof window !== 'undefined' && typeof window.AudioContext === 'function'
    ? new window.AudioContext()
    : null;
}

function readPreferences(storage: PreferenceStorage | null): AudioPreferences {
  const defaults = { muted: false, volume: 0.35 };
  try {
    const value: unknown = JSON.parse(storage?.getItem(AUDIO_PREFERENCES_KEY) ?? 'null');
    if (typeof value !== 'object' || value === null) return defaults;
    return {
      muted: 'muted' in value && typeof value.muted === 'boolean' ? value.muted : defaults.muted,
      volume:
        'volume' in value && typeof value.volume === 'number' && Number.isFinite(value.volume)
          ? Math.min(1, Math.max(0, value.volume))
          : defaults.volume,
    };
  } catch {
    return defaults;
  }
}

export function createSoundEffects(options: SoundEffectsOptions = {}) {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const createContext = options.createAudioContext ?? browserAudioContext;
  let preferences = readPreferences(storage);
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();
  const voices = new Map<OscillatorNode, GainNode>();

  const release = (oscillator: OscillatorNode, envelope: GainNode): void => {
    oscillator.onended = null;
    oscillator.disconnect();
    envelope.disconnect();
    voices.delete(oscillator);
  };

  const stop = (): void => {
    for (const [oscillator, envelope] of voices) {
      try {
        oscillator.stop();
      } catch {
        /* Nodo già terminato. */
      }
      release(oscillator, envelope);
    }
  };

  const updatePreferences = (next: AudioPreferences): void => {
    preferences = next;
    if (context && master && context.state !== 'closed') {
      try {
        master.gain.setValueAtTime(next.muted ? 0 : next.volume, context.currentTime);
      } catch {
        // Le preferenze restano modificabili anche se il dispositivo audio fallisce.
      }
    }
    if (next.muted || next.volume === 0) stop();
    try {
      storage?.setItem(AUDIO_PREFERENCES_KEY, JSON.stringify(next));
    } catch {
      /* Storage opzionale. */
    }
    for (const listener of listeners) listener();
  };

  const unlock = async (): Promise<void> => {
    if (disposed || preferences.muted || preferences.volume === 0) return;
    try {
      if (context === null || context.state === 'closed') {
        stop();
        master?.disconnect();
        context = createContext();
        master = null;
        if (context === null) return;
        master = context.createGain();
        master.gain.setValueAtTime(preferences.volume, context.currentTime);
        master.connect(context.destination);
      }
      if (context.state === 'suspended') await context.resume();
    } catch {
      // API assente, limiti del dispositivo o policy autoplay: il gioco prosegue.
    }
  };

  const playEvent = (event: GameEvent, speed: 1 | 2 = 1): void => {
    const sound = getEventSound(event);
    if (
      disposed ||
      preferences.muted ||
      preferences.volume === 0 ||
      sound === null ||
      context?.state !== 'running' ||
      master === null
    )
      return;
    try {
      const now = context.currentTime;
      for (const [frequency, endFrequency, offset, duration, wave] of SOUNDS[sound]) {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        voices.set(oscillator, envelope);
        const start = now + offset / speed;
        const end = start + duration / speed;
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(endFrequency, end);
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(0.12 / SOUNDS[sound].length, start + 0.006 / speed);
        envelope.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(envelope);
        envelope.connect(master);
        oscillator.onended = () => release(oscillator, envelope);
        oscillator.start(start);
        oscillator.stop(end);
      }
    } catch {
      stop();
    }
  };

  return {
    getPreferences: (): AudioPreferences => preferences,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setMuted: (muted: boolean): void => updatePreferences({ ...preferences, muted }),
    setVolume: (volume: number): void => {
      if (Number.isFinite(volume))
        updatePreferences({ ...preferences, volume: Math.min(1, Math.max(0, volume)) });
    },
    unlock,
    playEvent,
    stop,
    dispose: (): void => {
      disposed = true;
      stop();
      master?.disconnect();
      if (context && context.state !== 'closed') void context.close().catch(() => {});
      context = null;
      master = null;
      listeners.clear();
    },
  };
}

export type SoundEffects = ReturnType<typeof createSoundEffects>;
export const soundEffects = createSoundEffects();

/** Solo l'evento corrente suona: la coda, i duplicati e «Salta alla fine» restano silenziosi. */
export function connectGameAudio(store: GameStoreApi, audio: SoundEffects): () => void {
  const unsubscribe = store.subscribe((state, previous) => {
    if (
      state.isPaused ||
      (state.currentEvent === null && state.playedEvents !== previous.playedEvents)
    ) {
      audio.stop();
    } else if (
      state.currentEvent !== null &&
      ((state.currentEvent !== previous.currentEvent && state.playbackMoment === null) ||
        (state.playbackMoment === 'impact' && previous.playbackMoment === 'announce'))
    ) {
      audio.playEvent(state.currentEvent, state.speed);
    }
  });
  return () => {
    unsubscribe();
    audio.stop();
  };
}
