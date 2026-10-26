// TECH-SPEC §6.2, §9.7 punti 1 e 5 — Schermata Lobby Multiplayer Online:
// - Coda Veloce (mode: 'quick')
// - Crea Stanza Privata (room.create -> room.created con codice)
// - Entra in Stanza Privata tramite roomCode (queue.join mode: 'private')
// - Punto d'accesso diretto al Visualizzatore Replay

import type { DeckPayload } from '@epochs/engine';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  LAST_FINISHED_GAME_STORAGE_KEY,
  RemoteGameController,
  type RemoteControllerSnapshot,
} from '../controllers/remote-controller.js';
import {
  PRESET_DECK_OPTIONS,
  type PresetDeckOption,
} from './HomeScreen.js';

export interface OnlineLobbyScreenProps {
  readonly availableDecks?: readonly PresetDeckOption[] | undefined;
  readonly defaultWsUrl?: string | undefined;
  readonly initialController?: RemoteGameController | null | undefined;
  readonly onMatchReady: (
    controller: RemoteGameController,
    gameId: string,
  ) => void;
  readonly onOpenReplayViewer: (
    gameId?: string,
    httpBaseUrl?: string,
  ) => void;
  readonly onBackHome: () => void;
}

function readLastFinishedGameId(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(LAST_FINISHED_GAME_STORAGE_KEY) ?? '';
    }
  } catch {
    // Ignora errori storage
  }
  return '';
}

export function OnlineLobbyScreen({
  availableDecks = PRESET_DECK_OPTIONS,
  defaultWsUrl,
  initialController,
  onMatchReady,
  onOpenReplayViewer,
  onBackHome,
}: OnlineLobbyScreenProps): ReactElement {
  const fallbackDeck = availableDecks[0] ?? PRESET_DECK_OPTIONS[0]!;
  const [selectedDeckId, setSelectedDeckId] = useState<string>(fallbackDeck.id);
  const [joinRoomCodeInput, setJoinRoomCodeInput] = useState<string>('');
  const [replayGameIdInput, setReplayGameIdInput] = useState<string>(() =>
    readLastFinishedGameId(),
  );
  const [wsUrlInput, setWsUrlInput] = useState<string>(
    defaultWsUrl ?? 'ws://127.0.0.1:3000/ws',
  );
  const [snapshot, setSnapshot] = useState<RemoteControllerSnapshot | null>(
    initialController ? initialController.getSnapshot() : null,
  );
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const controllerRef = useRef<RemoteGameController | null>(
    initialController ?? null,
  );
  const handedOffToMatchRef = useRef<boolean>(false);

  const resolveSelectedDeck = (): DeckPayload => {
    const found = availableDecks.find((d) => d.id === selectedDeckId);
    return found ? found.payload : fallbackDeck.payload;
  };

  const ensureController = (): RemoteGameController => {
    const existing = controllerRef.current;
    if (existing !== null && existing.getWsUrl() === wsUrlInput.trim()) {
      return existing;
    }

    if (existing !== null && !handedOffToMatchRef.current) {
      existing.dispose();
    }

    const ctrl = new RemoteGameController({
      wsUrl: wsUrlInput.trim(),
      onStateChange: (nextSnap) => {
        setSnapshot(nextSnap);
        if (
          nextSnap.lobbyStatus === 'in_match' &&
          nextSnap.gameId !== null &&
          !handedOffToMatchRef.current
        ) {
          handedOffToMatchRef.current = true;
          onMatchReady(ctrl, nextSnap.gameId);
        }
      },
    });

    controllerRef.current = ctrl;
    setSnapshot(ctrl.getSnapshot());
    return ctrl;
  };

  useEffect(() => {
    const ctrl = ensureController();
    const unsubscribe = ctrl.subscribe((nextSnap) => {
      setSnapshot(nextSnap);
      if (
        nextSnap.lobbyStatus === 'in_match' &&
        nextSnap.gameId !== null &&
        !handedOffToMatchRef.current
      ) {
        handedOffToMatchRef.current = true;
        onMatchReady(ctrl, nextSnap.gameId);
      }
    });

    ctrl.connect().catch((err: unknown) => {
      if (controllerRef.current !== ctrl) {
        return;
      }
      setConnectionError(
        err instanceof Error
          ? err.message
          : 'Impossibile connettersi al server multiplayer.',
      );
    });

    return () => {
      unsubscribe();
      if (!handedOffToMatchRef.current && controllerRef.current !== null) {
        controllerRef.current.dispose();
        controllerRef.current = null;
      }
    };
  }, []);

  const handleConnectServer = async (): Promise<void> => {
    setConnectionError(null);
    const ctrl = ensureController();
    try {
      await ctrl.connect();
    } catch (err) {
      setConnectionError(
        err instanceof Error
          ? err.message
          : 'Connessione al server WebSocket non riuscita.',
      );
    }
  };

  const handleJoinQuickQueue = async (): Promise<void> => {
    setConnectionError(null);
    const ctrl = ensureController();
    try {
      await ctrl.joinQuickQueue(resolveSelectedDeck());
    } catch (err) {
      setConnectionError(
        err instanceof Error
          ? err.message
          : 'Impossibile avviare la Coda Veloce.',
      );
    }
  };

  const handleCreatePrivateRoom = async (): Promise<void> => {
    setConnectionError(null);
    const ctrl = ensureController();
    try {
      await ctrl.createPrivateRoom(resolveSelectedDeck());
    } catch (err) {
      setConnectionError(
        err instanceof Error
          ? err.message
          : 'Impossibile creare la stanza privata.',
      );
    }
  };

  const handleJoinPrivateRoom = async (): Promise<void> => {
    const trimmed = joinRoomCodeInput.trim().toUpperCase();
    if (trimmed.length < 4) {
      setConnectionError(
        'Inserisci un codice stanza valido (almeno 4 caratteri).',
      );
      return;
    }

    setConnectionError(null);
    const ctrl = ensureController();
    try {
      await ctrl.joinPrivateRoom(trimmed, resolveSelectedDeck());
    } catch (err) {
      setConnectionError(
        err instanceof Error
          ? err.message
          : 'Impossibile entrare nella stanza privata.',
      );
    }
  };

  const handleOpenReplay = (): void => {
    const ctrl = controllerRef.current;
    const httpBase = ctrl?.getHttpBaseUrl();
    const targetGameId = replayGameIdInput.trim();
    onOpenReplayViewer(
      targetGameId.length > 0 ? targetGameId : undefined,
      httpBase,
    );
  };

  const connectionLabel = (() => {
    switch (snapshot?.connectionStatus) {
      case 'authenticated':
        return `Connesso come ${snapshot.nickname ?? 'Ospite'} (${snapshot.playerId ?? ''})`;
      case 'authenticating':
        return 'Autenticazione sessione ospite in corso...';
      case 'connecting':
        return 'Connessione al server in corso...';
      case 'reconnecting':
        return 'Riconnessione automatica in corso...';
      default:
        return 'Disconnesso dal server';
    }
  })();

  return (
    <main
      className="cartographer-table online-lobby-screen"
      data-testid="online-lobby-screen"
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
        gap: '18px',
      }}
    >
      <div
        style={{
          width: 'min(1080px, 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Intestazione Lobby Online */}
        <header
          style={{
            padding: '16px 20px',
            borderRadius: '12px',
            backgroundColor: 'rgba(20, 30, 39, 0.92)',
            border: '1.5px solid var(--brass, #B58E48)',
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
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                marginBottom: '4px',
              }}
            >
              <span
                className={`board-badge ${
                  snapshot?.connectionStatus === 'authenticated'
                    ? 'board-badge--brass'
                    : 'board-badge--muted'
                }`}
                data-testid="online-connection-status"
                data-status={snapshot?.connectionStatus ?? 'disconnected'}
              >
                {connectionLabel}
              </span>
            </div>

            <h1
              className="font-display"
              style={{
                margin: 0,
                fontSize: 'clamp(1.35rem, 2.5vw, 1.85rem)',
                color: 'var(--brass, #B58E48)',
              }}
            >
              Lobby Multiplayer Online
            </h1>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="touch-target"
              data-testid="open-replay-viewer-btn"
              onClick={handleOpenReplay}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid var(--brass, #B58E48)',
                backgroundColor: 'rgba(181, 142, 72, 0.2)',
                color: 'var(--chalk, #E9E5D6)',
                fontFamily: 'var(--font-numeric)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Visualizzatore Replay
            </button>

            <button
              type="button"
              className="touch-target"
              data-testid="back-to-home-btn"
              onClick={onBackHome}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid rgba(233, 229, 214, 0.35)',
                backgroundColor: 'var(--surface-card, #223444)',
                color: 'var(--chalk, #E9E5D6)',
                fontFamily: 'var(--font-numeric)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Torna alla Home
            </button>
          </div>
        </header>

        {/* Banner Errore Server / Connessione */}
        {(snapshot?.lastError || connectionError) && (
          <div
            role="alert"
            data-testid="online-error-banner"
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(168, 64, 77, 0.22)',
              border: '1.5px solid var(--crimson, #A8404D)',
              color: 'var(--chalk, #E9E5D6)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.94rem',
            }}
          >
            <strong>Attenzione:</strong>{' '}
            {snapshot?.lastError
              ? `${snapshot.lastError.code} — ${snapshot.lastError.message}`
              : connectionError}
          </div>
        )}

        {/* Configurazione Mazzo e Server */}
        <section
          aria-label="Selezione mazzo e connessione server"
          style={{
            padding: '16px 20px',
            borderRadius: '10px',
            backgroundColor: 'rgba(20, 30, 39, 0.88)',
            border: '1px solid rgba(181, 142, 72, 0.4)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '14px',
            alignItems: 'end',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label
              htmlFor="online-deck-select"
              className="font-numeric"
              style={{ fontSize: '0.86rem', fontWeight: 700 }}
            >
              Mazzo per la Partita Online (60 carte, 3×20)
            </label>
            <select
              id="online-deck-select"
              className="touch-target"
              data-testid="online-deck-select"
              value={selectedDeckId}
              onChange={(ev) => setSelectedDeckId(ev.target.value)}
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
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label
              htmlFor="online-ws-url-input"
              className="font-numeric"
              style={{ fontSize: '0.86rem', fontWeight: 700 }}
            >
              Indirizzo WebSocket Server
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="online-ws-url-input"
                type="text"
                data-testid="online-ws-url-input"
                value={wsUrlInput}
                onChange={(ev) => setWsUrlInput(ev.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(233, 229, 214, 0.25)',
                  backgroundColor: 'var(--surface-card, #223444)',
                  color: 'var(--chalk, #E9E5D6)',
                  fontFamily: 'var(--font-numeric)',
                  fontSize: '0.9rem',
                }}
              />
              <button
                type="button"
                className="touch-target"
                data-testid="online-connect-btn"
                onClick={() => void handleConnectServer()}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--brass, #B58E48)',
                  backgroundColor: 'var(--surface-card, #223444)',
                  color: 'var(--chalk, #E9E5D6)',
                  fontFamily: 'var(--font-numeric)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Connetti
              </button>
            </div>
          </div>
        </section>

        {/* Griglia Modalità Online: 1. Coda Veloce, 2. Stanza Privata */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
            gap: '16px',
          }}
        >
          {/* Card 1: Coda Veloce */}
          <section
            aria-labelledby="online-quick-queue-title"
            data-testid="online-quick-section"
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h2
                id="online-quick-queue-title"
                className="font-display"
                style={{
                  margin: 0,
                  fontSize: '1.22rem',
                  color: 'var(--brass, #B58E48)',
                }}
              >
                Coda Veloce (Matchmaking Rapido)
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.9rem',
                  color: 'var(--chalk-muted)',
                }}
              >
                Abbinamento immediato con il primo stratega in attesa sul server
                autoritativo.
              </p>

              {snapshot?.lobbyStatus === 'searching_quick' && (
                <div
                  data-testid="online-quick-searching-badge"
                  style={{
                    marginTop: '6px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(181, 142, 72, 0.18)',
                    border: '1px solid var(--brass, #B58E48)',
                    fontFamily: 'var(--font-numeric)',
                    fontWeight: 700,
                  }}
                >
                  In attesa di un avversario nella Coda Veloce...
                </div>
              )}
            </div>

            <button
              type="button"
              className="touch-target"
              data-testid="online-quick-queue-btn"
              onClick={() => void handleJoinQuickQueue()}
              style={{
                width: '100%',
                padding: '11px 18px',
                borderRadius: '8px',
                border: '1.5px solid var(--brass, #B58E48)',
                backgroundColor: 'var(--brass, #B58E48)',
                color: 'var(--table-deep, #141E27)',
                fontFamily: 'var(--font-numeric)',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Entra in Coda Veloce
            </button>
          </section>

          {/* Card 2: Stanza Privata con Codice */}
          <section
            aria-labelledby="online-private-room-title"
            data-testid="online-private-section"
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h2
                id="online-private-room-title"
                className="font-display"
                style={{
                  margin: 0,
                  fontSize: '1.22rem',
                  color: 'var(--chalk, #E9E5D6)',
                }}
              >
                Stanza Privata con Codice
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.9rem',
                  color: 'var(--chalk-muted)',
                }}
              >
                Genera un codice stanza da condividere con il tuo avversario o
                inserisci un codice ricevuto.
              </p>

              <button
                type="button"
                className="touch-target"
                data-testid="online-create-room-btn"
                onClick={() => void handleCreatePrivateRoom()}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: '1.5px solid var(--brass, #B58E48)',
                  backgroundColor: 'var(--surface-card, #223444)',
                  color: 'var(--chalk, #E9E5D6)',
                  fontFamily: 'var(--font-numeric)',
                  fontSize: '0.98rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Crea Stanza Privata
              </button>

              {snapshot?.roomCode && (
                <div
                  data-testid="online-created-room-box"
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(181, 142, 72, 0.2)',
                    border: '1.5px solid var(--brass, #B58E48)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <span style={{ fontSize: '0.88rem' }}>
                    Codice Stanza Privata:
                  </span>
                  <strong
                    className="font-numeric"
                    data-testid="online-created-room-code"
                    style={{
                      fontSize: '1.25rem',
                      letterSpacing: '0.12em',
                      color: 'var(--brass, #B58E48)',
                    }}
                  >
                    {snapshot.roomCode}
                  </strong>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  marginTop: '4px',
                }}
              >
                <label
                  htmlFor="online-join-room-code-input"
                  className="font-numeric"
                  style={{ fontSize: '0.84rem', fontWeight: 700 }}
                >
                  Entra con Codice Stanza
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    id="online-join-room-code-input"
                    type="text"
                    data-testid="online-join-room-code-input"
                    placeholder="Es. AB12CD"
                    value={joinRoomCodeInput}
                    onChange={(ev) =>
                      setJoinRoomCodeInput(ev.target.value.toUpperCase())
                    }
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid rgba(233, 229, 214, 0.3)',
                      backgroundColor: 'var(--surface-card, #223444)',
                      color: 'var(--chalk, #E9E5D6)',
                      fontFamily: 'var(--font-numeric)',
                      fontSize: '1rem',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}
                  />
                  <button
                    type="button"
                    className="touch-target"
                    data-testid="online-join-room-btn"
                    onClick={() => void handleJoinPrivateRoom()}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: '1.5px solid var(--brass, #B58E48)',
                      backgroundColor: 'var(--brass, #B58E48)',
                      color: 'var(--table-deep, #141E27)',
                      fontFamily: 'var(--font-numeric)',
                      fontSize: '0.96rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Entra nella Stanza
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Sezione Rapida Replay */}
        <section
          aria-labelledby="online-replay-shortcut-title"
          style={{
            padding: '16px 20px',
            borderRadius: '10px',
            backgroundColor: 'rgba(20, 30, 39, 0.86)',
            border: '1px solid rgba(181, 142, 72, 0.35)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'end',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ flex: 1, minWidth: '240px' }}>
            <h2
              id="online-replay-shortcut-title"
              className="font-display"
              style={{
                margin: 0,
                fontSize: '1.05rem',
                color: 'var(--brass, #B58E48)',
              }}
            >
              Replay Deterministico Partita Conclusa
            </h2>
            <p
              style={{
                margin: '4px 0 0 0',
                fontSize: '0.86rem',
                color: 'var(--chalk-muted)',
              }}
            >
              Inserisci l&apos;ID di una partita terminata per esaminarla passo
              dopo passo da P1, P2 o Pubblico.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <label htmlFor="online-replay-game-id-input" className="sr-only">
              ID Partita Replay
            </label>
            <input
              id="online-replay-game-id-input"
              type="text"
              data-testid="online-replay-game-id-input"
              placeholder="game_..."
              value={replayGameIdInput}
              onChange={(ev) => setReplayGameIdInput(ev.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(233, 229, 214, 0.28)',
                backgroundColor: 'var(--surface-card, #223444)',
                color: 'var(--chalk, #E9E5D6)',
                fontFamily: 'var(--font-numeric)',
                fontSize: '0.92rem',
                minWidth: '210px',
              }}
            />
            <button
              type="button"
              className="touch-target"
              data-testid="online-load-replay-btn"
              onClick={handleOpenReplay}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid var(--brass, #B58E48)',
                backgroundColor: 'var(--surface-card, #223444)',
                color: 'var(--chalk, #E9E5D6)',
                fontFamily: 'var(--font-numeric)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Carica nel Visualizzatore Replay
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
