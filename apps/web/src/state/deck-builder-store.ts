// M6-01 — Bozze locali, mazzi validati e sincronizzazione REST esplicita.
import { CARDS_RULES } from '@epochs/content';
import {
  validateDeck,
  MAX_COPIES_PER_CARD,
  SUBDECK_SIZE,
  type CardRules,
  type CardType,
  type DeckPayload,
  type EraNo,
  type Resource,
  type Resources,
  type ValidationIssue,
} from '@epochs/engine';
import { z } from 'zod';
import { createStore, useStore, type StoreApi } from 'zustand';
import { DeckPayloadSchema } from '../../../../data/schema/deck.schema.js';

export const DECK_BUILDER_STORAGE_KEY = 'epochs_deck_builder_v1';
const ERAS = [1, 2, 3] as const;
const RESOURCES = ['food', 'wood', 'metal'] as const;
type EraKey = '1' | '2' | '3';
const eraKey = (era: EraNo): EraKey => String(era) as EraKey;

// Le bozze possono essere incomplete, ma non possono violare i limiti di costruzione.
const DraftSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().max(60),
    description: z.string().max(240).optional(),
    subdecks: z
      .object({
        '1': z.array(z.string().min(1)).max(SUBDECK_SIZE),
        '2': z.array(z.string().min(1)).max(SUBDECK_SIZE),
        '3': z.array(z.string().min(1)).max(SUBDECK_SIZE),
      })
      .strict(),
  })
  .strict();

const PersistenceSchema = z
  .object({
    version: z.literal(1),
    draft: DraftSchema,
    savedDecks: z.array(DeckPayloadSchema),
  })
  .strict();

const ServerDeckSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  payload: DeckPayloadSchema,
});

export interface DeckStatistics {
  total: number;
  byEra: Record<EraNo, number>;
  byType: Record<CardType, number>;
  /** Istogrammi costo -> numero di carte, inclusi i costi zero e tutte le copie. */
  costCurve: Record<Resource, Record<number, number>>;
  totalCost: Resources;
}

export interface DeckSyncOptions {
  /** Token della sessione ospite già stabilita dal client online. */
  token: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface DeckBuilderOptions {
  catalog?: Record<string, CardRules>;
  /** null disabilita la persistenza; undefined usa localStorage, se accessibile. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  storageKey?: string;
}

export interface DeckBuilderState {
  draft: DeckPayload;
  savedDecks: DeckPayload[];
  issues: ValidationIssue[];
  isValid: boolean;
  statistics: DeckStatistics;
  error: string | null;
  persistenceError: string | null;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  newDeck: (name?: string) => void;
  setName: (name: string) => boolean;
  setDescription: (description: string) => boolean;
  addCard: (cardId: string) => boolean;
  removeCard: (cardId: string) => boolean;
  loadDeck: (id: string) => boolean;
  importJson: (json: string) => boolean;
  exportJson: () => string | null;
  saveDeck: () => boolean;
  /** Pull + upsert dei mazzi salvati. In caso di conflitto per ID prevale la copia locale. */
  syncWithServer: (options: DeckSyncOptions) => Promise<boolean>;
}

export type DeckBuilderStoreApi = StoreApi<DeckBuilderState>;

function createDeckId(): string {
  // getRandomValues è disponibile anche su HTTP nelle prove da dispositivo mobile.
  const words = globalThis.crypto.getRandomValues(new Uint32Array(4));
  return `deck_${Array.from(words, (word) => word.toString(16).padStart(8, '0')).join('')}`;
}

function emptyDeck(name = 'Nuovo mazzo'): DeckPayload {
  return {
    id: createDeckId(),
    name: name.slice(0, 60),
    subdecks: { '1': [], '2': [], '3': [] },
  };
}

function withId(deck: DeckPayload): DeckPayload {
  return { ...structuredClone(deck), id: deck.id ?? createDeckId() };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Operazione sul mazzo non riuscita.';
}

export function calculateDeckStatistics(
  deck: DeckPayload,
  catalog: Record<string, CardRules> = CARDS_RULES,
): DeckStatistics {
  const statistics: DeckStatistics = {
    total: 0,
    byEra: { 1: 0, 2: 0, 3: 0 },
    byType: { economy: 0, unit: 0, instant: 0, conversion: 0 },
    costCurve: { food: {}, wood: {}, metal: {} },
    totalCost: { food: 0, wood: 0, metal: 0 },
  };
  for (const era of ERAS) {
    const cards = deck.subdecks[eraKey(era)];
    statistics.byEra[era] = cards.length;
    statistics.total += cards.length;
    for (const id of cards) {
      const card = catalog[id];
      if (card === undefined) continue;
      statistics.byType[card.type]++;
      for (const resource of RESOURCES) {
        const cost = card.cost[resource];
        const curve = statistics.costCurve[resource];
        curve[cost] = (curve[cost] ?? 0) + 1;
        statistics.totalCost[resource] += cost;
      }
    }
  }
  return statistics;
}

export function createDeckBuilderStore(options: DeckBuilderOptions = {}): DeckBuilderStoreApi {
  const catalog = options.catalog ?? CARDS_RULES;
  const storageKey = options.storageKey ?? DECK_BUILDER_STORAGE_KEY;
  let storage = options.storage;
  let persistenceError: string | null = null;
  if (storage === undefined) {
    try {
      storage = typeof window === 'undefined' ? null : window.localStorage;
    } catch (error) {
      persistenceError = message(error);
      storage = null;
    }
  }

  function validateComplete(value: unknown): DeckPayload {
    const deck = DeckPayloadSchema.parse(value);
    const issues = validateDeck(deck, catalog);
    if (issues.length > 0) throw new Error(issues[0]!.message);
    return deck;
  }

  function derived(draft: DeckPayload) {
    const issues = validateDeck(draft, catalog);
    return {
      issues,
      isValid: issues.length === 0 && DeckPayloadSchema.safeParse(draft).success,
      statistics: calculateDeckStatistics(draft, catalog),
    };
  }

  let draft = emptyDeck();
  let savedDecks: DeckPayload[] = [];
  try {
    const raw = storage?.getItem(storageKey);
    if (raw != null) {
      const parsed = PersistenceSchema.parse(JSON.parse(raw));
      // Zod inferisce anche undefined per i campi opzionali; lo stato usa
      // exactOptionalPropertyTypes e omette invece le proprietà assenti.
      const restoredDraft: DeckPayload = {
        id: parsed.draft.id,
        name: parsed.draft.name,
        subdecks: parsed.draft.subdecks,
        ...(parsed.draft.description !== undefined
          ? { description: parsed.draft.description }
          : {}),
      };
      const blockingIssues = validateDeck(restoredDraft, catalog).filter(
        (issue) => issue.code !== 'INVALID_SUBDECK_LENGTH',
      );
      if (blockingIssues.length > 0) throw new Error(blockingIssues[0]!.message);
      const restoredDecks = parsed.savedDecks.map((deck) => withId(validateComplete(deck)));
      draft = restoredDraft;
      savedDecks = restoredDecks;
    }
  } catch (error) {
    persistenceError = message(error);
  }

  return createStore<DeckBuilderState>()((set, get) => {
    const fail = (error: string): false => {
      set({ error });
      return false;
    };

    const persist = (): void => {
      if (storage == null) return;
      try {
        const { draft, savedDecks } = get();
        storage.setItem(storageKey, JSON.stringify({ version: 1, draft, savedDecks }));
        set({ persistenceError: null });
      } catch (error) {
        set({ persistenceError: message(error) });
      }
    };

    const updateDraft = (next: DeckPayload): true => {
      set({ draft: next, ...derived(next), error: null });
      persist();
      return true;
    };

    return {
      draft,
      savedDecks,
      ...derived(draft),
      error: null,
      persistenceError,
      syncStatus: 'idle',

      newDeck: (name) => {
        updateDraft(emptyDeck(name));
      },
      setName: (name) =>
        name.length > 60
          ? fail('Il nome può contenere al massimo 60 caratteri.')
          : updateDraft({ ...get().draft, name }),
      setDescription: (description) =>
        description.length > 240
          ? fail('La descrizione può contenere al massimo 240 caratteri.')
          : updateDraft({ ...get().draft, description }),
      addCard: (cardId) => {
        const card = catalog[cardId];
        if (card === undefined || !Object.hasOwn(catalog, cardId)) {
          return fail('Carta non presente nel catalogo.');
        }
        const draft = get().draft;
        const key = eraKey(card.era);
        const cards = draft.subdecks[key];
        if (cards.filter((id) => id === cardId).length >= MAX_COPIES_PER_CARD) {
          return fail('Sono consentite al massimo 3 copie per carta.');
        }
        if (cards.length >= SUBDECK_SIZE)
          return fail('Sono consentite al massimo 20 carte per Era.');
        return updateDraft({
          ...draft,
          subdecks: { ...draft.subdecks, [key]: [...cards, cardId] },
        });
      },
      removeCard: (cardId) => {
        const draft = get().draft;
        const era = ERAS.find((era) => draft.subdecks[eraKey(era)].includes(cardId));
        if (era === undefined) return fail('Carta assente dal mazzo.');
        const key = eraKey(era);
        const cards = [...draft.subdecks[key]];
        cards.splice(cards.indexOf(cardId), 1);
        return updateDraft({ ...draft, subdecks: { ...draft.subdecks, [key]: cards } });
      },
      loadDeck: (id) => {
        const deck = get().savedDecks.find((deck) => deck.id === id);
        return deck === undefined ? fail('Mazzo non trovato.') : updateDraft(structuredClone(deck));
      },
      importJson: (json) => {
        try {
          return updateDraft(withId(validateComplete(JSON.parse(json))));
        } catch (error) {
          return fail(message(error));
        }
      },
      exportJson: () => {
        try {
          const deck = validateComplete(get().draft);
          set({ error: null });
          return JSON.stringify(deck, null, 2);
        } catch (error) {
          fail(message(error));
          return null;
        }
      },
      saveDeck: () => {
        try {
          const deck = withId(validateComplete(get().draft));
          const savedDecks = get().savedDecks.filter((saved) => saved.id !== deck.id);
          set({
            draft: structuredClone(deck),
            savedDecks: [...savedDecks, deck],
            error: null,
            syncStatus: get().syncStatus === 'syncing' ? 'syncing' : 'idle',
          });
          persist();
          return true;
        } catch (error) {
          return fail(message(error));
        }
      },
      syncWithServer: async ({ token, baseUrl = '', fetch: fetcher = globalThis.fetch }) => {
        if (get().syncStatus === 'syncing') return false;
        set({ syncStatus: 'syncing', error: null });
        const localDecks = structuredClone(get().savedDecks);
        try {
          if (token.trim().length === 0)
            throw new Error('Sessione ospite richiesta per sincronizzare.');
          const url = `${baseUrl.replace(/\/$/, '')}/api/v1/decks`;
          const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
          const response = await fetcher(url, { headers });
          if (!response.ok) throw new Error(`Caricamento mazzi fallito (HTTP ${response.status}).`);
          const remote = z
            .object({ decks: z.array(ServerDeckSchema) })
            .parse(await response.json());
          const remoteDecks = remote.decks.map((record) =>
            validateComplete({
              ...record.payload,
              id: record.id,
              name: record.name,
            }),
          );
          for (const deck of localDecks) {
            const response = await fetcher(url, {
              method: 'POST',
              headers,
              body: JSON.stringify(validateComplete(deck)),
            });
            if (!response.ok)
              throw new Error(`Salvataggio mazzo fallito (HTTP ${response.status}).`);
            const saved = z.object({ deck: ServerDeckSchema }).parse(await response.json()).deck;
            validateComplete(saved.payload);
            if (saved.id !== deck.id)
              throw new Error('ID mazzo inatteso nella risposta del server.');
          }
          // Usa i valori correnti: salvataggi e modifiche durante la richiesta restano locali.
          const latest = get().savedDecks;
          const merged = new Map(remoteDecks.map((deck) => [deck.id, deck]));
          for (const deck of latest) merged.set(deck.id, deck);
          set({
            savedDecks: [...merged.values()],
            syncStatus: JSON.stringify(localDecks) === JSON.stringify(latest) ? 'synced' : 'idle',
          });
          persist();
          return true;
        } catch (error) {
          set({ syncStatus: 'error', error: message(error) });
          return false;
        }
      },
    };
  });
}

export const deckBuilderStore = createDeckBuilderStore();

export function useDeckBuilderStore<T>(selector: (state: DeckBuilderState) => T): T {
  return useStore(deckBuilderStore, selector);
}
