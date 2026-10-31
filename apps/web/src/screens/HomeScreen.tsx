import type { BotKind } from '@epochs/bots';
import type { DeckPayload } from '@epochs/engine';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { X } from 'lucide-react';

export type AppScreenId =
  'home' | 'match' | 'online' | 'deck-builder' | 'archive' | 'tutorial' | 'rules';

import { PRESET_DECK_OPTIONS, DEFAULT_PLAYER_DECK_ID, DEFAULT_OPPONENT_DECK_ID, presetOption, type PresetDeckOption } from '../content/presets.js';
export { PRESET_DECK_OPTIONS, type PresetDeckOption } from '../content/presets.js';

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
  readonly availableDecks?: readonly PresetDeckOption[] | undefined;
  readonly defaultSeed?: string | undefined;
  readonly onStartBotMatch: (request: StartBotMatchRequest) => void;
  readonly onStartHotSeatMatch: (request: StartHotSeatMatchRequest) => void;
  readonly onNavigate: (screen: AppScreenId) => void;
}

export function HomeScreen({
  availableDecks = PRESET_DECK_OPTIONS,
  defaultSeed = 'epochs-cartographer-seed-1',
  onStartBotMatch,
  onStartHotSeatMatch,
  onNavigate,
}: HomeScreenProps): ReactElement {
  const fallbackDeck = availableDecks.find(d=>d.id===DEFAULT_PLAYER_DECK_ID) ?? availableDecks[0] ?? presetOption(DEFAULT_PLAYER_DECK_ID);
  const secondFallbackDeck = availableDecks.find(d=>d.id===DEFAULT_OPPONENT_DECK_ID) ?? fallbackDeck;

  const [botKind, setBotKind] = useState<BotKind>('greedy');
  const [playerDeckId, setPlayerDeckId] = useState<string>(fallbackDeck.id);
  const [botDeckId, setBotDeckId] = useState<string>(secondFallbackDeck.id);
  const [hotSeatP1DeckId, setHotSeatP1DeckId] = useState<string>(fallbackDeck.id);
  const [hotSeatP2DeckId, setHotSeatP2DeckId] = useState<string>(secondFallbackDeck.id);
  const [seedInput, setSeedInput] = useState<string>(defaultSeed);
  const [activePanel, setActivePanel] = useState<'bot' | 'hotseat' | 'settings' | null>(null);

  const resolveDeckById = (id: string): DeckPayload => {
    const found = availableDecks.find((d) => d.id === id);
    return found ? found.payload : fallbackDeck.payload;
  };

  const selectedPlayerDeckOption =
    availableDecks.find((d) => d.id === playerDeckId) ?? fallbackDeck;
  const sameVersion = (first: string, second: string): boolean =>
    (resolveDeckById(first).catalogVersion ?? '1.0') === (resolveDeckById(second).catalogVersion ?? '1.0');
  const botVersionsMatch = sameVersion(playerDeckId, botDeckId);
  const hotSeatVersionsMatch = sameVersion(hotSeatP1DeckId, hotSeatP2DeckId);

  const handleStartBot = (): void => {
    if (!botVersionsMatch) return;
    const normalizedSeed =
      seedInput.trim().length > 0 ? seedInput.trim() : 'epochs-cartographer-seed-1';
    onStartBotMatch({
      botKind,
      playerDeck: resolveDeckById(playerDeckId),
      botDeck: resolveDeckById(botDeckId),
      seed: normalizedSeed,
    });
  };

  const handleStartHotSeat = (): void => {
    if (!hotSeatVersionsMatch) return;
    const normalizedSeed =
      seedInput.trim().length > 0 ? seedInput.trim() : 'epochs-cartographer-hotseat-1';
    onStartHotSeatMatch({
      p1Deck: resolveDeckById(hotSeatP1DeckId),
      p2Deck: resolveDeckById(hotSeatP2DeckId),
      seed: normalizedSeed,
    });
  };

  return (
    <main className="cartographer-table home-screen" data-testid="home-screen">
      <div className="home-launcher">
        <header className="home-brand" data-testid="home-header">
          <span className="home-brand__ornament" aria-hidden="true">
            ✦
          </span>
          <h1 className="home-brand__title">Epochs</h1>
          <span className="home-brand__rule" aria-hidden="true" />
        </header>

        <nav
          className="home-icon-grid"
          aria-label="Menu principale"
          data-testid="home-secondary-nav"
        >
          <HomeAction
            art="bot"
            label="Partita contro Bot"
            description="Scegli difficoltà e mazzi, poi sfida un avversario controllato dal gioco."
            testId="open-bot-setup-btn"
            primary
            onClick={() => setActivePanel('bot')}
            dialog
          />
          <HomeAction
            art="hotseat"
            label="Partita Locale Hot-Seat"
            description="Due giocatori sullo stesso dispositivo, con passaggi di turno riservati."
            testId="open-hotseat-setup-btn"
            onClick={() => setActivePanel('hotseat')}
            dialog
          />
          <HomeAction
            art="online"
            label="Multiplayer Online"
            description="Entra in coda, crea una stanza privata o guarda un replay."
            testId="nav-online-lobby-btn"
            onClick={() => onNavigate('online')}
          />
          <HomeAction
            art="tutorial"
            label="Tutorial guidato"
            description="Impara a giocare attraverso le tre Ere, dal Mulligan alla Breccia."
            testId="nav-tutorial-btn"
            onClick={() => onNavigate('tutorial')}
          />
          <HomeAction
            art="archive"
            label="Archivio Carte"
            description="Esplora le carte per Era, tipo, categoria e parole chiave."
            testId="nav-card-archive-btn"
            onClick={() => onNavigate('archive')}
          />
          <HomeAction
            art="deck-builder"
            label="Deck Builder"
            description="Componi i tuoi mazzi e importa o esporta le tue creazioni."
            testId="nav-deck-builder-btn"
            onClick={() => onNavigate('deck-builder')}
          />
          <HomeAction
            art="rules"
            label="Regolamento"
            description="Consulta le regole, dalla preparazione alla vittoria."
            testId="nav-full-rules-btn"
            onClick={() => onNavigate('rules')}
          />
          <HomeAction
            art="settings"
            label="Impostazioni partita"
            description="Personalizza il seed delle partite locali."
            testId="open-match-settings-btn"
            onClick={() => setActivePanel('settings')}
            dialog
          />
        </nav>
      </div>

      {activePanel === 'bot' && (
        <HomeDialog labelledBy="home-bot-section-title" onClose={() => setActivePanel(null)}>
          <section
            className="home-mode"
            aria-labelledby="home-bot-section-title"
            data-testid="home-bot-section"
            style={{
              padding: '18px 20px',
              borderRadius: '12px',
              backgroundColor: 'var(--panel)',
              border: '1.5px solid var(--brass)',
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
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <h2
                    id="home-bot-section-title"
                    className="font-display"
                    style={{
                      margin: 0,
                      fontSize: '1.25rem',
                      color: 'var(--brass)',
                    }}
                  >
                    Partita contro Bot
                  </h2>
                  <span className="board-badge board-badge--brass">Giocatore Singolo</span>
                </div>
                <p
                  style={{
                    margin: '4px 0 0 0',
                    fontSize: '0.88rem',
                    color: 'var(--chalk-muted)',
                  }}
                >
                  Affronta un avversario controllato dal gioco e scegli la tua sfida.
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
                        ? '1.5px solid var(--brass)'
                        : '1px solid rgba(233, 229, 214, 0.22)',
                    backgroundColor:
                      botKind === 'random' ? 'rgba(181, 142, 72, 0.24)' : 'var(--surface-card)',
                    color: 'var(--chalk)',
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
                        ? '1.5px solid var(--brass)'
                        : '1px solid rgba(233, 229, 214, 0.22)',
                    backgroundColor:
                      botKind === 'greedy' ? 'rgba(181, 142, 72, 0.24)' : 'var(--surface-card)',
                    color: 'var(--chalk)',
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
                    backgroundColor: 'var(--surface-card)',
                    color: 'var(--chalk)',
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
                    backgroundColor: 'var(--surface-card)',
                    color: 'var(--chalk)',
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

            {!botVersionsMatch && <p role="alert">Scegli due mazzi della stessa versione. Nel Deck Builder puoi creare una copia di civiltà di un mazzo classico.</p>}
            <button
              type="button"
              className="touch-target home-mode__start"
              data-testid="start-bot-match-btn"
              disabled={!botVersionsMatch}
              onClick={handleStartBot}
              style={{
                width: '100%',
                padding: '11px 18px',
                borderRadius: '8px',
                border: '1.5px solid var(--brass)',
                backgroundColor: 'var(--brass)',
                color: 'var(--table-deep)',
                fontFamily: 'var(--font-numeric)',
                fontSize: '1.02rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Avvia Partita contro Bot
            </button>
          </section>
        </HomeDialog>
      )}

      {activePanel === 'hotseat' && (
        <HomeDialog labelledBy="home-hotseat-section-title" onClose={() => setActivePanel(null)}>
          <section
            className="home-mode"
            aria-labelledby="home-hotseat-section-title"
            data-testid="home-hotseat-section"
            style={{
              padding: '18px 20px',
              borderRadius: '12px',
              backgroundColor: 'var(--panel)',
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
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <h2
                    id="home-hotseat-section-title"
                    className="font-display"
                    style={{
                      margin: 0,
                      fontSize: '1.25rem',
                      color: 'var(--chalk)',
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
                  Sfida un altro giocatore sullo stesso dispositivo, con passaggi di turno
                  riservati.
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
                    backgroundColor: 'var(--surface-card)',
                    color: 'var(--chalk)',
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
                    backgroundColor: 'var(--surface-card)',
                    color: 'var(--chalk)',
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

            {!hotSeatVersionsMatch && <p role="alert">Scegli due mazzi della stessa versione. Nel Deck Builder puoi creare una copia di civiltà di un mazzo classico.</p>}
            <button
              type="button"
              className="touch-target home-mode__start"
              data-testid="start-hotseat-match-btn"
              disabled={!hotSeatVersionsMatch}
              onClick={handleStartHotSeat}
              style={{
                width: '100%',
                padding: '11px 18px',
                borderRadius: '8px',
                border: '1.5px solid var(--brass)',
                backgroundColor: 'var(--surface-card)',
                color: 'var(--chalk)',
                fontFamily: 'var(--font-numeric)',
                fontSize: '1.02rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Avvia Partita Hot-Seat
            </button>
          </section>
        </HomeDialog>
      )}

      {activePanel === 'settings' && (
        <HomeDialog labelledBy="home-settings-title" onClose={() => setActivePanel(null)}>
          <section className="home-settings">
            <h2 id="home-settings-title">Impostazioni partita</h2>
            <label htmlFor="home-seed-input">Seed deterministico partita</label>
            <input
              id="home-seed-input"
              type="text"
              data-testid="home-seed-input"
              value={seedInput}
              onChange={(ev) => setSeedInput(ev.target.value)}
            />
            <p>
              Lo stesso seed e gli stessi mazzi permettono di riprodurre la medesima partita
              iniziale.
            </p>
          </section>
        </HomeDialog>
      )}
    </main>
  );
}

function HomeAction({
  art,
  label,
  description,
  testId,
  onClick,
  primary = false,
  unavailable = false,
  dialog = false,
}: {
  readonly art:
    'bot' | 'hotseat' | 'online' | 'tutorial' | 'archive' | 'deck-builder' | 'rules' | 'settings';
  readonly label: string;
  readonly description: string;
  readonly testId: string;
  readonly onClick?: () => void;
  readonly primary?: boolean;
  readonly unavailable?: boolean;
  readonly dialog?: boolean;
}): ReactElement {
  const [dismissed, setDismissed] = useState(false);
  return (
    <div
      className="home-action"
      onMouseEnter={() => setDismissed(false)}
      onMouseLeave={() => setDismissed(false)}
      onFocus={() => setDismissed(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setDismissed(true);
      }}
    >
      <button
        type="button"
        className={`home-action__button${primary ? ' home-action__button--primary' : ''}`}
        data-testid={testId}
        aria-label={label}
        aria-describedby={`${testId}-tooltip`}
        aria-disabled={unavailable || undefined}
        aria-haspopup={dialog ? 'dialog' : undefined}
        onClick={unavailable ? undefined : onClick}
      >
        <img
          className="home-action__art"
          src={`/menu-art/${art}.webp`}
          alt=""
          aria-hidden="true"
          width={384}
          height={384}
          draggable={false}
        />
      </button>
      <span
        role="tooltip"
        id={`${testId}-tooltip`}
        className="home-action__tooltip"
        data-dismissed={dismissed}
      >
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
    </div>
  );
}

function HomeDialog({
  labelledBy,
  onClose,
  children,
}: {
  readonly labelledBy: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="home-dialog"
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button
        type="button"
        className="home-dialog__close touch-target"
        aria-label="Chiudi finestra"
        onClick={onClose}
        autoFocus
      >
        <X size={22} aria-hidden="true" />
      </button>
      {children}
    </dialog>
  );
}
