import type { BotKind } from '@epochs/bots';
import type { DeckPayload } from '@epochs/engine';
import { useState, type ReactElement, type ReactNode } from 'react';
import aggroBreachJson from '../../../../data/decks/aggro-breach.json' with { type: 'json' };
import balancedTacticalJson from '../../../../data/decks/balanced-tactical.json' with { type: 'json' };
import boomEconomyJson from '../../../../data/decks/boom-economy.json' with { type: 'json' };
import { EraIcon, StatIcon } from '../components/icons/DomainIcons.js';

export type AppScreenId =
  | 'home'
  | 'match'
  | 'online'
  | 'deck-builder'
  | 'archive'
  | 'rules';

export interface PresetDeckOption {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly payload: DeckPayload;
}

export const PRESET_DECK_OPTIONS: readonly PresetDeckOption[] = Object.freeze([
  {
    id: aggroBreachJson.id,
    name: aggroBreachJson.name,
    description: aggroBreachJson.description,
    payload: aggroBreachJson as DeckPayload,
  },
  {
    id: balancedTacticalJson.id,
    name: balancedTacticalJson.name,
    description: balancedTacticalJson.description,
    payload: balancedTacticalJson as DeckPayload,
  },
  {
    id: boomEconomyJson.id,
    name: boomEconomyJson.name,
    description: boomEconomyJson.description,
    payload: boomEconomyJson as DeckPayload,
  },
]);

export interface StartBotMatchRequest {
  readonly botKind: BotKind;
  readonly playerDeck: DeckPayload;
  readonly botDeck: DeckPayload;
  readonly seed: string;
}

export interface StartHotSeatMatchRequest {
  readonly p1Deck: DeckPayload;
  readonly p2Deck: DeckPayload;
  readonly seed: string;
}

export interface HomeScreenProps {
  readonly audioControls?: ReactNode;
  readonly availableDecks?: readonly PresetDeckOption[] | undefined;
  readonly defaultSeed?: string | undefined;
  readonly onStartBotMatch: (request: StartBotMatchRequest) => void;
  readonly onStartHotSeatMatch: (request: StartHotSeatMatchRequest) => void;
  readonly onNavigate: (screen: AppScreenId) => void;
}

export function HomeScreen({
  audioControls,
  availableDecks = PRESET_DECK_OPTIONS,
  defaultSeed = 'epochs-cartographer-seed-1',
  onStartBotMatch,
  onStartHotSeatMatch,
  onNavigate,
}: HomeScreenProps): ReactElement {
  const fallbackDeck = availableDecks[0] ?? PRESET_DECK_OPTIONS[0]!;
  const secondFallbackDeck =
    availableDecks[1] ?? availableDecks[0] ?? PRESET_DECK_OPTIONS[1]!;

  const [botKind, setBotKind] = useState<BotKind>('greedy');
  const [playerDeckId, setPlayerDeckId] = useState<string>(fallbackDeck.id);
  const [botDeckId, setBotDeckId] = useState<string>(secondFallbackDeck.id);
  const [hotSeatP1DeckId, setHotSeatP1DeckId] = useState<string>(
    fallbackDeck.id,
  );
  const [hotSeatP2DeckId, setHotSeatP2DeckId] = useState<string>(
    secondFallbackDeck.id,
  );
  const [seedInput, setSeedInput] = useState<string>(defaultSeed);

  const resolveDeckById = (id: string): DeckPayload => {
    const found = availableDecks.find((d) => d.id === id);
    return found ? found.payload : fallbackDeck.payload;
  };

  const selectedPlayerDeckOption =
    availableDecks.find((d) => d.id === playerDeckId) ?? fallbackDeck;

  const handleStartBot = (): void => {
    const normalizedSeed =
      seedInput.trim().length > 0
        ? seedInput.trim()
        : 'epochs-cartographer-seed-1';
    onStartBotMatch({
      botKind,
      playerDeck: resolveDeckById(playerDeckId),
      botDeck: resolveDeckById(botDeckId),
      seed: normalizedSeed,
    });
  };

  const handleStartHotSeat = (): void => {
    const normalizedSeed =
      seedInput.trim().length > 0
        ? seedInput.trim()
        : 'epochs-cartographer-hotseat-1';
    onStartHotSeatMatch({
      p1Deck: resolveDeckById(hotSeatP1DeckId),
      p2Deck: resolveDeckById(hotSeatP2DeckId),
      seed: normalizedSeed,
    });
  };

  return (
    <main
      className="cartographer-table home-screen"
      data-testid="home-screen"
      style={{
        width: '100%',
        height: '100dvh',
        maxHeight: '100dvh',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: 'clamp(12px, 2.5vw, 28px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
      }}
    >
      <div
        style={{
          width: 'min(1080px, 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        {/* Intestazione "Il Tavolo del Cartografo" */}
        {audioControls}
        <header
          data-testid="home-header"
          style={{
            padding: '18px 22px',
            borderRadius: '12px',
            backgroundColor: 'rgba(20, 30, 39, 0.9)',
            border: '1.5px solid var(--brass, #B58E48)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '4px',
              }}
            >
              <EraIcon era={1} size={18} />
              <EraIcon era={2} size={18} />
              <EraIcon era={3} size={18} />
              <span
                className="font-numeric"
                style={{
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--brass, #B58E48)',
                }}
              >
                Regolamento Ufficiale v1.0 · 3 Ere · 45 Carte
              </span>
            </div>

            <h1
              className="font-display"
              style={{
                margin: 0,
                fontSize: 'clamp(1.5rem, 3vw, 2.2rem)',
                color: 'var(--chalk, #E9E5D6)',
              }}
            >
              The Epochs — Il Tavolo del Cartografo
            </h1>

            <p
              style={{
                margin: '4px 0 0 0',
                fontSize: '0.96rem',
                color: 'var(--chalk-muted, #A7B4C2)',
              }}
            >
              Pianificazione economica, posizionamento coperto, rivelazione
              simultanea e assedio su tre Ere storiche.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              minWidth: '210px',
            }}
          >
            <label
              htmlFor="home-seed-input"
              className="font-numeric"
              style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                color: 'var(--chalk-muted)',
              }}
            >
              Seed deterministico partita
            </label>
            <input
              id="home-seed-input"
              type="text"
              data-testid="home-seed-input"
              value={seedInput}
              onChange={(ev) => setSeedInput(ev.target.value)}
              style={{
                padding: '7px 10px',
                borderRadius: '6px',
                border: '1px solid rgba(181, 142, 72, 0.45)',
                backgroundColor: 'var(--surface-card, #223444)',
                color: 'var(--chalk, #E9E5D6)',
                fontFamily: 'var(--font-numeric)',
                fontSize: '0.9rem',
              }}
            />
          </div>
        </header>

        {/* Griglia principale: 1. Partita vs Bot, 2. Partita Locale Hot-Seat */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
            gap: '16px',
          }}
        >
          {/* Card 1: Gioca contro Bot (§9.7 punto 1) */}
          <section
            aria-labelledby="home-bot-section-title"
            data-testid="home-bot-section"
            style={{
              padding: '18px 20px',
              borderRadius: '12px',
              backgroundColor: 'rgba(20, 30, 39, 0.88)',
              border: '1.5px solid var(--brass, #B58E48)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '14px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <header>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <h2
                    id="home-bot-section-title"
                    className="font-display"
                    style={{
                      margin: 0,
                      fontSize: '1.25rem',
                      color: 'var(--brass, #B58E48)',
                    }}
                  >
                    Partita contro Bot
                  </h2>
                  <span className="board-badge board-badge--brass">
                    Giocatore Singolo
                  </span>
                </div>
                <p
                  style={{
                    margin: '4px 0 0 0',
                    fontSize: '0.88rem',
                    color: 'var(--chalk-muted)',
                  }}
                >
                  Sfida un automa locale che opera esclusivamente sulla propria
                  vista filtrata (RandomBot o GreedyBot).
                </p>
              </header>

              {/* Selezione difficoltà Bot */}
              <div
                role="group"
                aria-label="Seleziona difficoltà del Bot"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '8px',
                }}
              >
                <button
                  type="button"
                  className="touch-target"
                  data-testid="select-bot-random"
                  aria-pressed={botKind === 'random'}
                  onClick={() => setBotKind('random')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border:
                      botKind === 'random'
                        ? '1.5px solid var(--brass, #B58E48)'
                        : '1px solid rgba(233, 229, 214, 0.22)',
                    backgroundColor:
                      botKind === 'random'
                        ? 'rgba(181, 142, 72, 0.24)'
                        : 'var(--surface-card, #223444)',
                    color: 'var(--chalk, #E9E5D6)',
                    fontFamily: 'var(--font-numeric)',
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  RandomBot (Base)
                </button>

                <button
                  type="button"
                  className="touch-target"
                  data-testid="select-bot-greedy"
                  aria-pressed={botKind === 'greedy'}
                  onClick={() => setBotKind('greedy')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border:
                      botKind === 'greedy'
                        ? '1.5px solid var(--brass, #B58E48)'
                        : '1px solid rgba(233, 229, 214, 0.22)',
                    backgroundColor:
                      botKind === 'greedy'
                        ? 'rgba(181, 142, 72, 0.24)'
                        : 'var(--surface-card, #223444)',
                    color: 'var(--chalk, #E9E5D6)',
                    fontFamily: 'var(--font-numeric)',
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  GreedyBot (Tattico)
                </button>
              </div>

              {/* Selezione Mazzo Giocatore */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label
                  htmlFor="bot-player-deck-select"
                  className="font-numeric"
                  style={{ fontSize: '0.84rem', fontWeight: 700 }}
                >
                  Il tuo Mazzo (P1 — 60 carte, 3×20)
                </label>
                <select
                  id="bot-player-deck-select"
                  className="touch-target"
                  data-testid="bot-player-deck-select"
                  value={playerDeckId}
                  onChange={(ev) => setPlayerDeckId(ev.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(181, 142, 72, 0.45)',
                    backgroundColor: 'var(--surface-card, #223444)',
                    color: 'var(--chalk, #E9E5D6)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.92rem',
                  }}
                >
                  {availableDecks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.id})
                    </option>
                  ))}
                </select>
                <span
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--chalk-muted)',
                    fontStyle: 'italic',
                  }}
                >
                  {selectedPlayerDeckOption.description}
                </span>
              </div>

              {/* Selezione Mazzo Bot */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label
                  htmlFor="bot-opponent-deck-select"
                  className="font-numeric"
                  style={{ fontSize: '0.84rem', fontWeight: 700 }}
                >
                  Mazzo del Bot (P2)
                </label>
                <select
                  id="bot-opponent-deck-select"
                  className="touch-target"
                  data-testid="bot-opponent-deck-select"
                  value={botDeckId}
                  onChange={(ev) => setBotDeckId(ev.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(233, 229, 214, 0.25)',
                    backgroundColor: 'var(--surface-card, #223444)',
                    color: 'var(--chalk, #E9E5D6)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.92rem',
                  }}
                >
                  {availableDecks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              className="touch-target"
              data-testid="start-bot-match-btn"
              onClick={handleStartBot}
              style={{
                width: '100%',
                padding: '11px 18px',
                borderRadius: '8px',
                border: '1.5px solid var(--brass, #B58E48)',
                backgroundColor: 'var(--brass, #B58E48)',
                color: 'var(--table-deep, #141E27)',
                fontFamily: 'var(--font-numeric)',
                fontSize: '1.02rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Avvia Partita contro Bot
            </button>
          </section>

          {/* Card 2: Partita Locale Hot-Seat (§9.7 punto 1, §9.8) */}
          <section
            aria-labelledby="home-hotseat-section-title"
            data-testid="home-hotseat-section"
            style={{
              padding: '18px 20px',
              borderRadius: '12px',
              backgroundColor: 'rgba(20, 30, 39, 0.88)',
              border: '1px solid rgba(181, 142, 72, 0.45)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '14px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <header>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <h2
                    id="home-hotseat-section-title"
                    className="font-display"
                    style={{
                      margin: 0,
                      fontSize: '1.25rem',
                      color: 'var(--chalk, #E9E5D6)',
                    }}
                  >
                    Partita Locale Hot-Seat
                  </h2>
                  <span className="board-badge">2 Giocatori · Stesso Schermo</span>
                </div>
                <p
                  style={{
                    margin: '4px 0 0 0',
                    fontSize: '0.88rem',
                    color: 'var(--chalk-muted)',
                  }}
                >
                  Due comandanti sullo stesso dispositivo con schermata di blocco
                  privacy automatica a ogni cambio di turno o finestra segreta.
                </p>
              </header>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label
                  htmlFor="hotseat-p1-deck-select"
                  className="font-numeric"
                  style={{ fontSize: '0.84rem', fontWeight: 700 }}
                >
                  Mazzo Giocatore 1 (P1)
                </label>
                <select
                  id="hotseat-p1-deck-select"
                  className="touch-target"
                  data-testid="hotseat-p1-deck-select"
                  value={hotSeatP1DeckId}
                  onChange={(ev) => setHotSeatP1DeckId(ev.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(233, 229, 214, 0.25)',
                    backgroundColor: 'var(--surface-card, #223444)',
                    color: 'var(--chalk, #E9E5D6)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.92rem',
                  }}
                >
                  {availableDecks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.id})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label
                  htmlFor="hotseat-p2-deck-select"
                  className="font-numeric"
                  style={{ fontSize: '0.84rem', fontWeight: 700 }}
                >
                  Mazzo Giocatore 2 (P2)
                </label>
                <select
                  id="hotseat-p2-deck-select"
                  className="touch-target"
                  data-testid="hotseat-p2-deck-select"
                  value={hotSeatP2DeckId}
                  onChange={(ev) => setHotSeatP2DeckId(ev.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(233, 229, 214, 0.25)',
                    backgroundColor: 'var(--surface-card, #223444)',
                    color: 'var(--chalk, #E9E5D6)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.92rem',
                  }}
                >
                  {availableDecks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              className="touch-target"
              data-testid="start-hotseat-match-btn"
              onClick={handleStartHotSeat}
              style={{
                width: '100%',
                padding: '11px 18px',
                borderRadius: '8px',
                border: '1.5px solid var(--brass, #B58E48)',
                backgroundColor: 'var(--surface-card, #223444)',
                color: 'var(--chalk, #E9E5D6)',
                fontFamily: 'var(--font-numeric)',
                fontSize: '1.02rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Avvia Partita Hot-Seat
            </button>
          </section>
        </div>

        {/* Sezione Navigazione: Multiplayer Online, Deck Builder, Archivio Carte, Regolamento Rapido (§9.7) */}
        <nav
          aria-label="Sezioni del Tavolo del Cartografo"
          data-testid="home-secondary-nav"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
          }}
        >
          <button
            type="button"
            className="touch-target"
            data-testid="nav-online-lobby-btn"
            onClick={() => onNavigate('online')}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(181, 142, 72, 0.45)',
              backgroundColor: 'rgba(20, 30, 39, 0.86)',
              color: 'var(--chalk, #E9E5D6)',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              cursor: 'pointer',
            }}
          >
            <strong
              className="font-display"
              style={{ fontSize: '1rem', color: 'var(--brass)' }}
            >
              Multiplayer Online
            </strong>
            <span style={{ fontSize: '0.82rem', color: 'var(--chalk-muted)' }}>
              Coda Veloce, Stanze Private con codice e Visualizzatore Replay.
            </span>
          </button>

          <button
            type="button"
            className="touch-target"
            data-testid="nav-deck-builder-btn"
            onClick={() => onNavigate('deck-builder')}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(181, 142, 72, 0.45)',
              backgroundColor: 'rgba(20, 30, 39, 0.86)',
              color: 'var(--chalk, #E9E5D6)',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              cursor: 'pointer',
            }}
          >
            <strong
              className="font-display"
              style={{ fontSize: '1rem', color: 'var(--brass)' }}
            >
              Deck Builder
            </strong>
            <span style={{ fontSize: '0.82rem', color: 'var(--chalk-muted)' }}>
              Componi i 3 sotto-mazzi da 20 carte (max 3 copie) e importa/esporta
              JSON.
            </span>
          </button>

          <button
            type="button"
            className="touch-target"
            data-testid="nav-card-archive-btn"
            onClick={() => onNavigate('archive')}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(181, 142, 72, 0.45)',
              backgroundColor: 'rgba(20, 30, 39, 0.86)',
              color: 'var(--chalk, #E9E5D6)',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              cursor: 'pointer',
            }}
          >
            <strong
              className="font-display"
              style={{ fontSize: '1rem', color: 'var(--brass)' }}
            >
              Archivio Carte
            </strong>
            <span style={{ fontSize: '0.82rem', color: 'var(--chalk-muted)' }}>
              Esplora tutte le 45 carte per Era, Tipo, Categoria, Linea e
              parole chiave.
            </span>
          </button>

          <button
            type="button"
            className="touch-target"
            data-testid="nav-quick-rules-btn"
            onClick={() => onNavigate('rules')}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(181, 142, 72, 0.45)',
              backgroundColor: 'rgba(20, 30, 39, 0.86)',
              color: 'var(--chalk, #E9E5D6)',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              cursor: 'pointer',
            }}
          >
            <strong
              className="font-display"
              style={{ fontSize: '1rem', color: 'var(--brass)' }}
            >
              Regolamento Rapido
            </strong>
            <span style={{ fontSize: '0.82rem', color: 'var(--chalk-muted)' }}>
              Sintesi di Raccolto, Rendite, Cap Logistico, 4 Fasi di Battaglia e
              Assedio.
            </span>
          </button>
        </nav>

        {/* Footer informativo */}
        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            fontSize: '0.8rem',
            color: 'var(--chalk-muted)',
            padding: '4px 6px',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <StatIcon stat="walls" size={14} /> Mura Base: 6 / 9 / 12 ·{' '}
            <StatIcon stat="cityCenter" size={14} /> Centro Città: 10 / 12 / 14
            HP
          </span>
          <span>
            Tocca a lungo (250ms) o fai doppio tap su qualsiasi carta per
            ispezionare regole e tooltip.
          </span>
        </footer>
      </div>
    </main>
  );
}
