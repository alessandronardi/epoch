import { CARD_CATALOG } from '@epochs/content';
import type { CardType, EraNo, Resource } from '@epochs/engine';
import { useState, type ReactElement } from 'react';
import { Card } from '../components/card/Card.js';
import {
  ERA_ROMAN_LABELS,
  RESOURCE_LABELS_IT,
  ResourceIcon,
} from '../components/icons/DomainIcons.js';
import { deckBuilderStore, useDeckBuilderStore } from '../state/deck-builder-store.js';
import { PRESET_DECK_OPTIONS } from './HomeScreen.js';
import './deck-builder.css';

const ERAS = [1, 2, 3] as const;
const RESOURCES = ['food', 'wood', 'metal'] as const;
const TYPE_LABELS: Record<CardType, string> = {
  economy: 'Edifici',
  unit: 'Unità',
  instant: 'Istantanee',
  conversion: 'Riconversioni',
};

function CostCurve({
  resource,
  curve,
}: {
  resource: Resource;
  curve: Record<number, number>;
}): ReactElement {
  const maxCost = Math.max(0, ...Object.keys(curve).map(Number));
  const maxCount = Math.max(1, ...Object.values(curve));
  return (
    <figure className={`deck-builder__curve deck-builder__curve--${resource}`}>
      <figcaption>
        <ResourceIcon resource={resource} /> {RESOURCE_LABELS_IT[resource]}
      </figcaption>
      <div
        className="deck-builder__bars"
        role="list"
        aria-label={`Curva dei costi ${RESOURCE_LABELS_IT[resource]}`}
      >
        {Array.from({ length: maxCost + 1 }, (_, cost) => (
          <div
            className="deck-builder__bucket"
            role="listitem"
            key={cost}
            aria-label={`Costo ${cost}: ${curve[cost] ?? 0} carte`}
          >
            <span>{curve[cost] ?? 0}</span>
            <span
              className="deck-builder__bar"
              aria-hidden="true"
              style={{ height: `${((curve[cost] ?? 0) / maxCount) * 64}px` }}
            />
            <strong aria-hidden="true">{cost}</strong>
          </div>
        ))}
      </div>
      <small>Costo → numero di carte</small>
    </figure>
  );
}

export interface DeckBuilderScreenProps {
  onBackHome: () => void;
  onInspectCard: (cardId: string) => void;
}

export function DeckBuilderScreen({
  onBackHome,
  onInspectCard,
}: DeckBuilderScreenProps): ReactElement {
  const state = useDeckBuilderStore((state) => state);
  const [era, setEra] = useState<EraNo>(1);
  const [type, setType] = useState<CardType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [jsonOpen, setJsonOpen] = useState(false);
  const [json, setJson] = useState('');
  const [notice, setNotice] = useState('');
  const cards = state.draft.subdecks[`${era}`];
  const selectedCards = [...new Set(cards)];
  const filteredCards = CARD_CATALOG.allCards.filter(
    (card) =>
      card.rules.era === era &&
      (type === 'all' || card.rules.type === type) &&
      `${card.text.name} ${card.id} ${card.rulesText}`
        .toLocaleLowerCase('it')
        .includes(search.toLocaleLowerCase('it').trim()),
  );

  const importJson = (input: string): void => {
    setNotice(state.importJson(input) ? 'Mazzo importato. Salvalo per usarlo in partita.' : '');
  };

  const exportJson = (): void => {
    const output = state.exportJson();
    if (output === null) return;
    const url = URL.createObjectURL(new Blob([output], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.draft.id ?? 'mazzo'}.json`;
    link.click();
    // Rilascia l'URL dopo che il browser ha avviato il download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice('Mazzo esportato in JSON.');
  };

  return (
    <main className="cartographer-table deck-builder" data-testid="screen-deck-builder">
      <div className="deck-builder__content">
        <header className="deck-builder__panel deck-builder__header">
          <div>
            <p className="deck-builder__eyebrow">Il Tavolo del Cartografo · Armeria</p>
            <h1>Deck Builder</h1>
            <p>Tre Ere, sessanta carte. Prepara la tua strategia.</p>
          </div>
          <button type="button" onClick={onBackHome} data-testid="back-to-home-btn">
            Torna alla Home
          </button>
        </header>

        <section className="deck-builder__panel" aria-label="Gestione mazzo">
          <div className="deck-builder__fields">
            <label>
              Nome del mazzo
              <input
                value={state.draft.name}
                maxLength={60}
                data-testid="deck-name-input"
                onChange={(event) => {
                  state.setName(event.target.value);
                  setNotice('');
                }}
              />
            </label>
            <label>
              Parti da un preset
              <select
                value=""
                data-testid="deck-preset-select"
                onChange={(event) => {
                  const preset = PRESET_DECK_OPTIONS.find((deck) => deck.id === event.target.value);
                  if (preset === undefined) return;
                  state.newDeck();
                  state.importJson(
                    JSON.stringify({
                      ...preset.payload,
                      id: deckBuilderStore.getState().draft.id,
                      name: `Copia di ${preset.name}`.slice(0, 60),
                    }),
                  );
                  setNotice('Copia personale creata dal preset.');
                }}
              >
                <option value="" disabled>
                  Scegli un mazzo di partenza
                </option>
                {PRESET_DECK_OPTIONS.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mazzi personali salvati
              <select
                value=""
                data-testid="deck-saved-select"
                onChange={(event) => {
                  state.loadDeck(event.target.value);
                  setNotice('Mazzo caricato.');
                }}
              >
                <option value="" disabled>
                  {state.savedDecks.length ? 'Apri un mazzo' : 'Nessun mazzo salvato'}
                </option>
                {state.savedDecks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Descrizione (facoltativa)
            <input
              value={state.draft.description ?? ''}
              maxLength={240}
              onChange={(event) => {
                state.setDescription(event.target.value);
                setNotice('');
              }}
            />
          </label>
          <div className="deck-builder__actions">
            <button
              type="button"
              onClick={() => {
                state.newDeck();
                setNotice('Nuovo mazzo vuoto.');
              }}
            >
              Nuovo mazzo
            </button>
            <button
              type="button"
              aria-expanded={jsonOpen}
              aria-controls="deck-json-panel"
              onClick={() => setJsonOpen(!jsonOpen)}
            >
              Importa JSON
            </button>
            <button
              type="button"
              disabled={!state.isValid}
              onClick={exportJson}
              data-testid="deck-export-btn"
            >
              Esporta JSON
            </button>
            <button
              type="button"
              className="deck-builder__primary"
              disabled={!state.isValid}
              data-testid="deck-save-btn"
              onClick={() => {
                if (state.saveDeck())
                  setNotice('Mazzo salvato. Disponibile in Home e nella lobby online.');
              }}
            >
              Salva mazzo
            </button>
          </div>
          {jsonOpen && (
            <div id="deck-json-panel" className="deck-builder__json">
              <label>
                File JSON
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file)
                      void file
                        .text()
                        .then(importJson)
                        .catch(() => setNotice('Impossibile leggere il file JSON.'));
                    event.target.value = '';
                  }}
                />
              </label>
              <label>
                Contenuto JSON
                <textarea
                  value={json}
                  onChange={(event) => setJson(event.target.value)}
                  rows={6}
                  spellCheck={false}
                />
              </label>
              <button
                type="button"
                disabled={json.trim().length === 0}
                onClick={() => importJson(json)}
              >
                Importa contenuto JSON
              </button>
            </div>
          )}
          <p role="status" data-testid="deck-notice">
            {notice}
          </p>
          {state.error && <p role="alert">{state.error}</p>}
          {state.persistenceError && (
            <p role="alert">Salvataggio locale non disponibile: {state.persistenceError}</p>
          )}
        </section>

        <nav className="deck-builder__eras" aria-label="Sotto-mazzi per Era">
          {ERAS.map((item) => (
            <button
              type="button"
              key={item}
              aria-pressed={item === era}
              data-testid={`deck-era-${item}`}
              onClick={() => {
                setEra(item);
                setNotice('');
              }}
            >
              <span>
                Era {ERA_ROMAN_LABELS[item]}: {state.statistics.byEra[item]}/20
              </span>
              <span className="deck-builder__completion">
                {state.statistics.byEra[item] === 20 ? 'Completo' : 'Da completare'}
              </span>
              <progress
                max={20}
                value={state.statistics.byEra[item]}
                aria-label={`Completamento Era ${ERA_ROMAN_LABELS[item]}`}
              />
            </button>
          ))}
        </nav>

        <section className="deck-builder__panel" aria-label="Statistiche del mazzo">
          <div className="deck-builder__header">
            <h2>La tua composizione · {state.statistics.total}/60</h2>
            <p data-testid="deck-validation" role="status">
              {state.isValid
                ? 'Mazzo valido · pronto per la partita'
                : 'Mazzo incompleto: servono 20 carte per Era e un nome.'}
            </p>
          </div>
          <ul className="deck-builder__types">
            {(Object.keys(TYPE_LABELS) as CardType[]).map((type) => (
              <li key={type}>
                {TYPE_LABELS[type]}: <strong>{state.statistics.byType[type]}</strong>
              </li>
            ))}
          </ul>
          <div className="deck-builder__curves">
            {RESOURCES.map((resource) => (
              <CostCurve
                key={resource}
                resource={resource}
                curve={state.statistics.costCurve[resource]}
              />
            ))}
          </div>
        </section>

        <div className="deck-builder__workspace">
          <section className="deck-builder__panel" aria-labelledby="deck-catalog-heading">
            <h2 id="deck-catalog-heading">Catalogo · Era {ERA_ROMAN_LABELS[era]}</h2>
            <div className="deck-builder__fields">
              <label>
                Cerca carte
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label>
                Tipo di carta
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value as CardType | 'all')}
                >
                  <option value="all">Tutti i tipi</option>
                  {(Object.keys(TYPE_LABELS) as CardType[]).map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p>Massimo 3 copie per carta. Tocca una carta per leggerla.</p>
            <div className="deck-builder__catalog">
              {filteredCards.map((card) => {
                const count = cards.filter((id) => id === card.id).length;
                return (
                  <div className="deck-builder__catalog-card" key={card.id}>
                    <Card card={card} onSelect={onInspectCard} onInspect={onInspectCard} />
                    <button
                      type="button"
                      data-testid={`deck-add-${card.id}`}
                      aria-label={`Aggiungi · ${count}/3 — ${card.text.name}`}
                      disabled={count >= 3 || cards.length >= 20}
                      onClick={() => {
                        state.addCard(card.id);
                        setNotice('');
                      }}
                    >
                      Aggiungi · {count}/3
                    </button>
                  </div>
                );
              })}
            </div>
            {filteredCards.length === 0 && <p>Nessuna carta corrisponde ai filtri.</p>}
          </section>

          <section
            className="deck-builder__panel deck-builder__selection"
            aria-labelledby="deck-selection-heading"
          >
            <h2 id="deck-selection-heading">
              Era {ERA_ROMAN_LABELS[era]} · {cards.length}/20 carte
            </h2>
            {selectedCards.length === 0 ? (
              <p>Scegli le carte dal catalogo per comporre questa Era.</p>
            ) : (
              <ul className="deck-builder__selected-list">
                {selectedCards.map((id) => {
                  const card = CARD_CATALOG.cardsById[id]!;
                  const count = cards.filter((cardId) => cardId === id).length;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className="deck-builder__card-name"
                        onClick={() => onInspectCard(id)}
                      >
                        {card.text.name}
                      </button>
                      <div className="deck-builder__quantity">
                        <button
                          type="button"
                          aria-label={`Rimuovi ${card.text.name}`}
                          data-testid={`deck-remove-${id}`}
                          onClick={() => {
                            state.removeCard(id);
                            setNotice('');
                          }}
                        >
                          −
                        </button>
                        <span aria-label={`${count} copie`}>{count}</span>
                        <button
                          type="button"
                          aria-label={`Aggiungi una copia di ${card.text.name}`}
                          disabled={count >= 3 || cards.length >= 20}
                          onClick={() => {
                            state.addCard(id);
                            setNotice('');
                          }}
                        >
                          +
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
