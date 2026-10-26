import balancedDeckJson from '../../../data/decks/balanced-tactical.json' with { type: 'json' };
import { CARDS_RULES } from '@epochs/content';
import { validateDeck, type DeckPayload } from '@epochs/engine';
import { describe, expect, it, vi } from 'vitest';
import {
  createDeckBuilderStore,
  DECK_BUILDER_STORAGE_KEY,
} from '../src/state/deck-builder-store.js';

function validDeck(id = 'custom-deck'): DeckPayload {
  return { ...structuredClone(balancedDeckJson), id };
}

function memoryStorage(initial?: string) {
  const entries = new Map<string, string>();
  if (initial !== undefined) entries.set(DECK_BUILDER_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      entries.set(key, value);
    }),
  };
}

function serverRecord(deck: DeckPayload) {
  return {
    id: deck.id,
    name: deck.name,
    payload: deck,
    playerId: 'guest',
    catalogVersion: '1.0',
    updatedAt: 123,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Deck Builder M6-01: composizione e validazione live', () => {
  it('parte con una bozza vuota, non salvabile né esportabile', () => {
    const store = createDeckBuilderStore({ storage: null });
    expect(store.getState().isValid).toBe(false);
    expect(store.getState().issues).toEqual(validateDeck(store.getState().draft, CARDS_RULES));
    expect(store.getState().issues.map((issue) => issue.era)).toEqual([1, 2, 3]);
    expect(store.getState().statistics.total).toBe(0);
    expect(store.getState().saveDeck()).toBe(false);
    expect(store.getState().exportJson()).toBeNull();
    expect(store.getState().savedDecks).toEqual([]);
  });

  it('costruisce 3x20 carte con Era automatica e blocca la quarta copia e la ventunesima carta', () => {
    const store = createDeckBuilderStore({ storage: null });
    for (const cardId of Object.values(validDeck().subdecks).flat()) {
      expect(store.getState().addCard(cardId)).toBe(true);
    }
    expect(store.getState().isValid).toBe(true);
    expect(store.getState().issues).toEqual([]);
    expect(store.getState().statistics.byEra).toEqual({ 1: 20, 2: 20, 3: 20 });
    const full = store.getState().draft;
    for (const cardId of ['e1_mine', 'e2_mill', 'e3_gld']) {
      expect(store.getState().addCard(cardId)).toBe(false);
      expect(store.getState().draft).toBe(full);
    }
    store.getState().newDeck();
    for (let i = 0; i < 3; i++) expect(store.getState().addCard('e1_farm')).toBe(true);
    const three = store.getState().draft;
    expect(store.getState().addCard('e1_farm')).toBe(false);
    expect(store.getState().draft).toBe(three);
    expect(store.getState().removeCard('e1_farm')).toBe(true);
    expect(store.getState().draft.subdecks['1']).toHaveLength(2);
    expect(store.getState().addCard('e1_farm')).toBe(true);
    expect(store.getState().error).toBeNull();
  });

  it('rifiuta carte sconosciute senza cambiare la bozza e rimuove una sola copia', () => {
    const store = createDeckBuilderStore({ storage: null });
    const initial = store.getState().draft;
    for (const cardId of ['missing', '__proto__', 'toString']) {
      expect(store.getState().addCard(cardId)).toBe(false);
    }
    expect(store.getState().removeCard('missing')).toBe(false);
    expect(store.getState().draft).toBe(initial);
    store.getState().importJson(JSON.stringify(validDeck()));
    store.getState().removeCard('e1_farm');
    expect(store.getState().draft.subdecks['1'].filter((id) => id === 'e1_farm')).toHaveLength(1);
    expect(store.getState().isValid).toBe(false);
    expect(store.getState().issues).toEqual(validateDeck(store.getState().draft, CARDS_RULES));
    expect(store.getState().statistics.total).toBe(59);
    store.getState().addCard('e1_farm');
    expect(store.getState().isValid).toBe(true);
  });

  it('calcola istogrammi e totali per risorsa contando copie, costo zero e riconversioni', () => {
    const store = createDeckBuilderStore({ storage: null });
    store.getState().addCard('e1_farm');
    store.getState().addCard('e1_farm');
    store.getState().addCard('e1_lumb');
    expect(store.getState().statistics).toEqual({
      total: 3,
      byEra: { 1: 3, 2: 0, 3: 0 },
      byType: { economy: 3, unit: 0, instant: 0, conversion: 0 },
      costCurve: { food: { 0: 2, 2: 1 }, wood: { 0: 1, 2: 2 }, metal: { 0: 3 } },
      totalCost: { food: 2, wood: 4, metal: 0 },
    });
    store.getState().importJson(JSON.stringify(validDeck()));
    const statistics = store.getState().statistics;
    expect(statistics.byType).toEqual({ economy: 7, unit: 45, instant: 6, conversion: 2 });
    for (const curve of Object.values(statistics.costCurve)) {
      expect(Object.values(curve).reduce((sum, count) => sum + count, 0)).toBe(60);
    }
    store.getState().removeCard('e1_farm');
    expect(store.getState().statistics.totalCost.wood).toBe(statistics.totalCost.wood - 2);
    expect(store.getState().statistics.costCurve.food[0]).toBe(statistics.costCurve.food[0]! - 1);
  });

  it('valida i metadati live e mantiene immutati gli snapshot precedenti', () => {
    const store = createDeckBuilderStore({ storage: null });
    store.getState().importJson(JSON.stringify(validDeck()));
    const before = structuredClone(store.getState().draft);
    expect(store.getState().setName('')).toBe(true);
    expect(store.getState().isValid).toBe(false);
    expect(store.getState().saveDeck()).toBe(false);
    expect(store.getState().setName('x'.repeat(61))).toBe(false);
    expect(store.getState().setDescription('x'.repeat(241))).toBe(false);
    expect(store.getState().setName('Mazzo personale')).toBe(true);
    expect(store.getState().setDescription('Strategia personale')).toBe(true);
    expect(store.getState().isValid).toBe(true);
    expect(before).toEqual(validDeck());
    expect(store.getState().draft.description).toBe('Strategia personale');
  });
});

describe('Deck Builder: import/export JSON', () => {
  it('esegue il round trip validato, assegna un ID se assente e non modifica il preset', () => {
    const input = validDeck();
    delete input.id;
    const store = createDeckBuilderStore({ storage: null });
    expect(store.getState().importJson(JSON.stringify(input))).toBe(true);
    expect(store.getState().draft.id).toMatch(/^deck_/);
    const output = store.getState().exportJson();
    expect(output).not.toBeNull();
    const second = createDeckBuilderStore({ storage: null });
    expect(second.getState().importJson(output!)).toBe(true);
    expect(second.getState().draft).toEqual(store.getState().draft);
    second.getState().removeCard('e1_farm');
    expect(store.getState().draft.subdecks['1']).toHaveLength(20);
    expect(balancedDeckJson.subdecks['1']).toHaveLength(20);
  });

  it.each([
    ['JSON malformato', () => '{'],
    ['null', () => 'null'],
    ['campi extra', () => JSON.stringify({ ...validDeck(), extra: true })],
    ['nome troppo lungo', () => JSON.stringify({ ...validDeck(), name: 'x'.repeat(61) })],
    [
      'sotto-mazzo incompleto',
      () => {
        const deck = validDeck();
        deck.subdecks['1'].pop();
        return JSON.stringify(deck);
      },
    ],
    [
      'sotto-mazzo troppo lungo',
      () => {
        const deck = validDeck();
        deck.subdecks['1'].push('e1_mine');
        return JSON.stringify(deck);
      },
    ],
    [
      'quattro copie',
      () => {
        const deck = validDeck();
        deck.subdecks['1'][2] = 'e1_farm';
        deck.subdecks['1'][3] = 'e1_farm';
        return JSON.stringify(deck);
      },
    ],
    [
      'carta sconosciuta',
      () => {
        const deck = validDeck();
        deck.subdecks['1'][0] = 'missing';
        return JSON.stringify(deck);
      },
    ],
    [
      'Era errata',
      () => {
        const deck = validDeck();
        deck.subdecks['1'][0] = 'e2_mill';
        return JSON.stringify(deck);
      },
    ],
  ])('rifiuta %s senza sovrascrivere bozza o salvataggi', (_label, input) => {
    const storage = memoryStorage();
    const store = createDeckBuilderStore({ storage });
    store.getState().importJson(JSON.stringify(validDeck()));
    store.getState().saveDeck();
    const previous = store.getState();
    const persisted = storage.getItem(DECK_BUILDER_STORAGE_KEY);
    expect(store.getState().importJson(input())).toBe(false);
    expect(store.getState().error).not.toBeNull();
    expect(store.getState().draft).toBe(previous.draft);
    expect(store.getState().savedDecks).toBe(previous.savedDecks);
    expect(storage.getItem(DECK_BUILDER_STORAGE_KEY)).toBe(persisted);
  });
});

describe('Deck Builder: persistenza locale', () => {
  it('usa localStorage del browser anche senza crypto.randomUUID disponibile', () => {
    const storage = memoryStorage();
    const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    vi.stubGlobal('window', { localStorage: storage });
    vi.stubGlobal('crypto', { getRandomValues });
    try {
      const store = createDeckBuilderStore();
      expect(store.getState().draft.id).toMatch(/^deck_[0-9a-f]{32}$/);
      store.getState().addCard('e1_farm');
      expect(createDeckBuilderStore().getState().draft).toEqual(store.getState().draft);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('gestisce il browser che nega accesso alla proprietà localStorage', () => {
    vi.stubGlobal(
      'window',
      Object.defineProperty({}, 'localStorage', {
        get: () => {
          throw new Error('storage disabled');
        },
      }),
    );
    try {
      const store = createDeckBuilderStore();
      expect(store.getState().persistenceError).toBe('storage disabled');
      expect(store.getState().addCard('e1_farm')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('ripristina bozze incomplete e salva più mazzi, aggiornando per ID senza duplicati', () => {
    const storage = memoryStorage();
    const store = createDeckBuilderStore({ storage });
    store.getState().setName('Bozza');
    store.getState().addCard('e3_gld');
    const restored = createDeckBuilderStore({ storage });
    expect(restored.getState().draft).toEqual(store.getState().draft);
    expect(restored.getState().isValid).toBe(false);
    expect(restored.getState().statistics.byType.conversion).toBe(1);
    store.getState().importJson(JSON.stringify(validDeck('one')));
    expect(store.getState().saveDeck()).toBe(true);
    store.getState().setName('Modificato');
    expect(store.getState().savedDecks[0]!.name).not.toBe('Modificato');
    store.getState().saveDeck();
    store.getState().importJson(JSON.stringify(validDeck('two')));
    store.getState().saveDeck();
    expect(store.getState().savedDecks).toHaveLength(2);
    expect(store.getState().loadDeck('one')).toBe(true);
    expect(store.getState().draft.name).toBe('Modificato');
    expect(store.getState().loadDeck('absent')).toBe(false);
    const reload = createDeckBuilderStore({ storage });
    expect(reload.getState().savedDecks).toEqual(store.getState().savedDecks);
    expect(reload.getState().draft).toEqual(store.getState().draft);
    store.getState().newDeck('Nuovo');
    expect(store.getState().draft.id).not.toBe('one');
    expect(store.getState().savedDecks).toHaveLength(2);
  });

  it.each([
    '{',
    JSON.stringify({ version: 2 }),
    JSON.stringify({
      version: 1,
      draft: { ...validDeck(), subdecks: { '1': ['missing'], '2': [], '3': [] } },
      savedDecks: [],
    }),
    JSON.stringify({
      version: 1,
      draft: {
        ...validDeck(),
        subdecks: {
          '1': ['e1_farm', 'e1_farm', 'e1_farm', 'e1_farm'],
          '2': [],
          '3': [],
        },
      },
      savedDecks: [],
    }),
    JSON.stringify({
      version: 1,
      draft: validDeck(),
      savedDecks: [{ ...validDeck(), name: '' }],
    }),
  ])('gestisce storage corrotto senza caricare mazzi invalidi (%#)', (raw) => {
    const storage = memoryStorage(raw);
    const store = createDeckBuilderStore({ storage });
    expect(store.getState().persistenceError).not.toBeNull();
    expect(store.getState().statistics.total).toBe(0);
    expect(store.getState().savedDecks).toEqual([]);
    expect(storage.getItem(DECK_BUILDER_STORAGE_KEY)).toBe(raw);
  });

  it('resta utilizzabile se lettura o scrittura localStorage falliscono', () => {
    const storage = {
      getItem: () => {
        throw new Error('access denied');
      },
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    const store = createDeckBuilderStore({ storage });
    expect(store.getState().persistenceError).toBe('access denied');
    expect(store.getState().importJson(JSON.stringify(validDeck()))).toBe(true);
    expect(store.getState().saveDeck()).toBe(true);
    expect(store.getState().persistenceError).toBe('quota exceeded');
    expect(store.getState().savedDecks).toHaveLength(1);
    expect(store.getState().isValid).toBe(true);
  });
});

describe('Deck Builder: sync server opzionale', () => {
  it('invia solo mazzi salvati e validati, usa Bearer e unisce i remoti con precedenza locale', async () => {
    const storage = memoryStorage();
    const store = createDeckBuilderStore({ storage });
    const local = validDeck('local');
    const remote = validDeck('remote');
    store.getState().importJson(JSON.stringify(local));
    store.getState().saveDeck();
    store.getState().removeCard('e1_farm'); // Bozza incompleta non sincronizzata.
    const draft = store.getState().draft;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          decks: [serverRecord(remote), serverRecord({ ...local, name: 'Remoto obsoleto' })],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ deck: serverRecord(local) }, 201));
    expect(
      await store.getState().syncWithServer({
        token: 'guest-token',
        baseUrl: 'https://epochs.test/',
        fetch: fetcher,
      }),
    ).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://epochs.test/api/v1/decks', {
      headers: { Authorization: 'Bearer guest-token', 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toEqual(local);
    expect(fetcher.mock.calls[1]![1]!.method).toBe('POST');
    expect(store.getState().savedDecks).toEqual([remote, local]);
    expect(store.getState().draft).toBe(draft);
    expect(store.getState().syncStatus).toBe('synced');
    expect(createDeckBuilderStore({ storage }).getState().savedDecks).toEqual([remote, local]);
  });

  it.each([
    'offline',
    'unauthorized',
    'post-failed',
    'bad-response',
    'invalid-remote',
    'invalid-ack',
  ])('preserva i dati locali su errore %s e permette un nuovo tentativo', async (failure) => {
    const store = createDeckBuilderStore({ storage: null });
    const deck = validDeck();
    store.getState().importJson(JSON.stringify(deck));
    store.getState().saveDeck();
    const before = store.getState();
    const fetcher = vi.fn<typeof fetch>();
    if (failure === 'offline') fetcher.mockRejectedValueOnce(new Error('offline'));
    if (failure === 'unauthorized') fetcher.mockResolvedValueOnce(jsonResponse({}, 401));
    if (failure === 'bad-response') fetcher.mockResolvedValueOnce(jsonResponse({ decks: [{}] }));
    if (failure === 'invalid-remote') {
      const invalid = validDeck();
      invalid.subdecks['1'][0] = 'missing';
      fetcher.mockResolvedValueOnce(jsonResponse({ decks: [serverRecord(invalid)] }));
    }
    if (failure === 'post-failed' || failure === 'invalid-ack') {
      fetcher.mockResolvedValueOnce(jsonResponse({ decks: [] }));
      fetcher.mockResolvedValueOnce(
        failure === 'post-failed'
          ? jsonResponse({}, 503)
          : jsonResponse({ deck: serverRecord(validDeck('wrong-id')) }),
      );
    }
    expect(await store.getState().syncWithServer({ token: 'guest', fetch: fetcher })).toBe(false);
    expect(store.getState().syncStatus).toBe('error');
    expect(store.getState().error).not.toBeNull();
    expect(store.getState().draft).toBe(before.draft);
    expect(store.getState().savedDecks).toBe(before.savedDecks);
    fetcher
      .mockResolvedValueOnce(jsonResponse({ decks: [] }))
      .mockResolvedValueOnce(jsonResponse({ deck: serverRecord(deck) }));
    expect(await store.getState().syncWithServer({ token: 'guest', fetch: fetcher })).toBe(true);
    expect(store.getState().error).toBeNull();
  });

  it('mantiene i salvataggi concorrenti e blocca sync sovrapposte', async () => {
    const store = createDeckBuilderStore({ storage: null });
    store.getState().importJson(JSON.stringify(validDeck()));
    store.getState().saveDeck();
    let complete!: (value: Response) => void;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      )
      .mockResolvedValueOnce(jsonResponse({ deck: serverRecord(validDeck()) }));
    const sync = store.getState().syncWithServer({ token: 'guest', fetch: fetcher });
    expect(await store.getState().syncWithServer({ token: 'guest', fetch: fetcher })).toBe(false);
    store.getState().setName('Modificato durante sync');
    store.getState().saveDeck();
    complete(jsonResponse({ decks: [] }));
    expect(await sync).toBe(true);
    expect(store.getState().draft.name).toBe('Modificato durante sync');
    expect(store.getState().savedDecks[0]!.name).toBe('Modificato durante sync');
    expect(store.getState().syncStatus).toBe('idle');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('richiede un token senza avviare richieste di rete', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const store = createDeckBuilderStore({ storage: null });
    expect(await store.getState().syncWithServer({ token: '', fetch: fetcher })).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(store.getState().syncStatus).toBe('error');
  });
});
