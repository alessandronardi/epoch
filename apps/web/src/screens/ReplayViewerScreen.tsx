// TECH-SPEC §6.4, §9.7 punto 5 — Visualizzatore Replay Deterministico:
// - Caricamento da GET /api/v1/games/:id/replay?as=P1|P2|public
// - Controlli Play / Pausa / Passo Avanti / Passo Indietro / Reset / Fine
// - Selettore del punto di vista (P1, P2, Pubblico)

import { getCatalog } from '@epochs/content';
import { getOpponent, type GameEvent, type PlayerView } from '@epochs/engine';
import { useEffect, useState, type ReactElement } from 'react';
import {
  ReplayPayloadSchema,
  type ReplayPayload,
  type ReplayPerspective,
} from '../../../../packages/protocol/src/index.js';
import {
  ERA_LABELS_IT,
  RESOURCE_LABELS_IT,
  ResourceIcon,
  StatIcon,
} from '../components/icons/DomainIcons.js';
import { LAST_FINISHED_GAME_STORAGE_KEY } from '../controllers/remote-controller.js';
import { describeEvent } from '../state/event-describer.js';

export interface ReplayViewerScreenProps {
  readonly onCatalogVersion?: ((version:'1.0'|'2.0')=>void) | undefined;
  readonly loadReplay?:
    ((id: string, perspective: ReplayPerspective) => Promise<ReplayPayload>) | undefined;
  readonly onInteraction?:
    | ((
        action: ReplayPerspective | 'play' | 'pause' | 'forward' | 'back' | 'end' | 'reset',
      ) => void)
    | undefined;
  readonly initialGameId?: string | undefined;
  readonly initialPerspective?: ReplayPerspective | undefined;
  readonly httpBaseUrl?: string | undefined;
  readonly initialReplayPayload?: ReplayPayload | null | undefined;
  readonly onInspectCard?: ((cardId: string) => void) | undefined;
  readonly onBack: () => void;
}

function readStoredGameId(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(LAST_FINISHED_GAME_STORAGE_KEY) ?? '';
    }
  } catch {
    // Ignora errori storage
  }
  return '';
}

export function ReplayViewerScreen({
  onCatalogVersion,
  initialGameId,
  initialPerspective = 'P1',
  httpBaseUrl = 'http://127.0.0.1:3000',
  initialReplayPayload = null,
  onInspectCard,
  onBack,
  loadReplay,
  onInteraction,
}: ReplayViewerScreenProps): ReactElement {
  const [gameIdInput, setGameIdInput] = useState<string>(() => initialGameId ?? readStoredGameId());
  const [serverUrlInput, setServerUrlInput] = useState<string>(httpBaseUrl);
  const [perspective, setPerspective] = useState<ReplayPerspective>(initialPerspective);
  const [replay, setReplay] = useState<ReplayPayload | null>(initialReplayPayload);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadReplayFromServer = async (
    targetGameId: string,
    targetPerspective: ReplayPerspective,
  ): Promise<void> => {
    const trimmedId = targetGameId.trim();
    if (trimmedId.length === 0) {
      setErrorMessage('Inserisci un ID partita valido per caricare il replay.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setIsPlaying(false);

    try {
      if (loadReplay) {
        const parsed = ReplayPayloadSchema.parse(await loadReplay(trimmedId, targetPerspective));
        setReplay(parsed);
        setStepIndex((previous) => Math.min(previous, parsed.steps.length));
        return;
      }
      const base = serverUrlInput.trim().replace(/\/+$/, '');
      const url = `${base}/api/v1/games/${encodeURIComponent(
        trimmedId,
      )}/replay?as=${encodeURIComponent(targetPerspective)}`;

      const res = await fetch(url, { method: 'GET' });
      const data: unknown = await res.json();

      if (!res.ok) {
        const msg =
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof (data as { message: unknown }).message === 'string'
            ? (data as { message: string }).message
            : `Errore HTTP ${res.status} durante il caricamento del replay.`;
        setErrorMessage(msg);
        setIsLoading(false);
        return;
      }

      const parsed = ReplayPayloadSchema.parse(data);
      setReplay(parsed);
      setStepIndex((prev) => Math.min(prev, parsed.steps.length));
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Impossibile caricare il replay dal server.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialReplayPayload !== null) {
      return;
    }
    const candidateId = (initialGameId ?? readStoredGameId()).trim();
    if (candidateId.length > 0) {
      void loadReplayFromServer(candidateId, perspective);
    }
  }, []);

  useEffect(() => {
    if (!isPlaying || replay === null) {
      return;
    }
    if (stepIndex >= replay.steps.length) {
      setIsPlaying(false);
      return;
    }

    const timer = setTimeout(() => {
      setStepIndex((prev) => {
        if (prev >= replay.steps.length) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 600);

    return () => {
      clearTimeout(timer);
    };
  }, [isPlaying, stepIndex, replay]);

  const handleSelectPerspective = (nextPerspective: ReplayPerspective): void => {
    setPerspective(nextPerspective);
    onInteraction?.(nextPerspective);
    if (gameIdInput.trim().length > 0) {
      void loadReplayFromServer(gameIdInput, nextPerspective);
    }
  };

  const totalSteps = replay?.steps.length ?? 0;
  const activeStep =
    replay !== null && stepIndex > 0 ? (replay.steps[stepIndex - 1] ?? null) : null;
  const currentView: PlayerView | null =
    replay === null ? null : activeStep !== null ? activeStep.view : replay.initialView;
  const currentStepEvents: readonly GameEvent[] =
    replay === null ? [] : activeStep !== null ? activeStep.events : replay.initialEvents;

  const selfId = currentView?.me ?? 'P1';
  const catalogVersion=currentView?.catalogVersion??'1.0';
  const CARDS_TEXT_IT=getCatalog(catalogVersion).textById;
  useEffect(()=>{onCatalogVersion?.(catalogVersion);},[onCatalogVersion,catalogVersion]);
  const opponentId = getOpponent(selfId);

  return (
    <main
      className="cartographer-table replay-viewer-screen"
      data-testid="replay-viewer-screen"
      style={{
        width: '100%',
        height: '100dvh',
        maxHeight: '100dvh',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: 'clamp(12px, 2.5vw, 24px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <div
        style={{
          width: 'min(1120px, 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {/* Header */}
        <header
          style={{
            padding: '14px 18px',
            borderRadius: '12px',
            backgroundColor: 'var(--panel)',
            border: '1px solid var(--panel-border)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <span className="board-badge board-badge--brass">
              Event Sourcing &amp; Verifica stateHash
            </span>
            <h1
              className="font-display"
              style={{
                margin: '4px 0 0 0',
                fontSize: 'clamp(1.3rem, 2.4vw, 1.75rem)',
                color: 'var(--chalk)',
              }}
            >
              Visualizzatore Replay Deterministico
            </h1>
          </div>

          <button
            type="button"
            className="touch-target"
            data-testid="replay-back-btn"
            onClick={onBack}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--brass)',
              backgroundColor: 'var(--surface-card)',
              color: 'var(--chalk)',
              fontFamily: 'var(--font-numeric)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Torna Indietro
          </button>
        </header>

        {/* Barra caricamento Replay e selettore punto di vista (P1, P2, Pubblico) */}
        <section
          aria-label="Configurazione e punto di vista del replay"
          style={{
            padding: '14px 18px',
            borderRadius: '10px',
            backgroundColor: 'var(--panel-soft)',
            border: '1px solid var(--panel-border)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'end',
            justifyContent: 'space-between',
            gap: '14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              alignItems: 'end',
              flex: 1,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label
                htmlFor="replay-game-id-input"
                className="font-numeric"
                style={{ fontSize: '0.82rem', fontWeight: 700 }}
              >
                ID Partita Conclusa
              </label>
              <input
                id="replay-game-id-input"
                type="text"
                data-testid="replay-game-id-input"
                placeholder="game_..."
                value={gameIdInput}
                onChange={(ev) => setGameIdInput(ev.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--panel-border)',
                  backgroundColor: 'var(--surface-card)',
                  color: 'var(--chalk)',
                  fontFamily: 'var(--font-numeric)',
                  fontSize: '0.92rem',
                  minWidth: '210px',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label
                htmlFor="replay-server-url-input"
                className="font-numeric"
                style={{ fontSize: '0.82rem', fontWeight: 700 }}
              >
                Server HTTP
              </label>
              <input
                id="replay-server-url-input"
                type="text"
                data-testid="replay-server-url-input"
                value={serverUrlInput}
                onChange={(ev) => setServerUrlInput(ev.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(233, 229, 214, 0.25)',
                  backgroundColor: 'var(--surface-card)',
                  color: 'var(--chalk)',
                  fontFamily: 'var(--font-numeric)',
                  fontSize: '0.88rem',
                  minWidth: '180px',
                }}
              />
            </div>

            <button
              type="button"
              className="touch-target"
              data-testid="replay-load-btn"
              disabled={isLoading}
              onClick={() => void loadReplayFromServer(gameIdInput, perspective)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid var(--panel-border)',
                backgroundColor: 'var(--brass)',
                color: 'var(--table-deep)',
                fontFamily: 'var(--font-numeric)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isLoading ? 'Caricamento...' : 'Carica Replay'}
            </button>
          </div>

          {/* Selettore Punto di Vista: P1, P2, Pubblico */}
          <div
            role="group"
            aria-label="Punto di vista del replay"
            data-testid="replay-perspective-selector"
            style={{
              display: 'flex',
              gap: '6px',
              alignItems: 'center',
            }}
          >
            {(
              [
                { id: 'P1', label: 'Punto di vista P1' },
                { id: 'P2', label: 'Punto di vista P2' },
                { id: 'public', label: 'Pubblico' },
              ] as const
            ).map((opt) => {
              const active = perspective === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className="touch-target"
                  data-testid={`replay-perspective-${opt.id}`}
                  aria-pressed={active}
                  onClick={() => handleSelectPerspective(opt.id)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: active
                      ? '1.5px solid var(--brass)'
                      : '1px solid rgba(233, 229, 214, 0.25)',
                    backgroundColor: active ? 'rgba(181, 142, 72, 0.26)' : 'var(--surface-card)',
                    color: 'var(--chalk)',
                    fontFamily: 'var(--font-numeric)',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {errorMessage && (
          <div
            role="alert"
            data-testid="replay-error-banner"
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(168, 64, 77, 0.22)',
              border: '1.5px solid var(--crimson)',
              color: 'var(--chalk)',
            }}
          >
            {errorMessage}
          </div>
        )}

        {replay !== null && currentView !== null && (
          <>
            {/* Barra Controlli Riproduzione: Play / Pausa / Passo Avanti / Passo Indietro */}
            <section
              aria-label="Controlli riproduzione replay"
              data-testid="replay-controls-bar"
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                backgroundColor: 'var(--panel)',
                border: '1px solid var(--panel-border)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="touch-target"
                  data-testid="replay-reset-btn"
                  disabled={stepIndex === 0}
                  onClick={() => {
                    onInteraction?.('reset');
                    setIsPlaying(false);
                    setStepIndex(0);
                  }}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(233, 229, 214, 0.3)',
                    backgroundColor: 'var(--surface-card)',
                    color: 'var(--chalk)',
                    fontFamily: 'var(--font-numeric)',
                    fontWeight: 700,
                    cursor: stepIndex === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Inizio (0)
                </button>

                <button
                  type="button"
                  className="touch-target"
                  data-testid="replay-prev-step-btn"
                  disabled={stepIndex === 0}
                  onClick={() => {
                    onInteraction?.('back');
                    setIsPlaying(false);
                    setStepIndex((s) => Math.max(0, s - 1));
                  }}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(233, 229, 214, 0.3)',
                    backgroundColor: 'var(--surface-card)',
                    color: 'var(--chalk)',
                    fontFamily: 'var(--font-numeric)',
                    fontWeight: 700,
                    cursor: stepIndex === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Passo Indietro
                </button>

                <button
                  type="button"
                  className="touch-target"
                  data-testid="replay-play-pause-btn"
                  onClick={() => {
                    onInteraction?.(isPlaying ? 'pause' : 'play');
                    setIsPlaying((p) => !p);
                  }}
                  style={{
                    padding: '7px 16px',
                    borderRadius: '6px',
                    border: '1px solid var(--panel-border)',
                    backgroundColor: isPlaying ? 'rgba(181, 142, 72, 0.28)' : 'var(--brass)',
                    color: isPlaying ? 'var(--chalk)' : 'var(--table-deep)',
                    fontFamily: 'var(--font-numeric)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isPlaying ? 'Pausa' : 'Play'}
                </button>

                <button
                  type="button"
                  className="touch-target"
                  data-testid="replay-step-forward-btn"
                  disabled={stepIndex >= totalSteps}
                  onClick={() => {
                    onInteraction?.('forward');
                    setIsPlaying(false);
                    setStepIndex((s) => Math.min(totalSteps, s + 1));
                  }}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '6px',
                    border: '1px solid var(--brass)',
                    backgroundColor: 'var(--surface-card)',
                    color: 'var(--chalk)',
                    fontFamily: 'var(--font-numeric)',
                    fontWeight: 700,
                    cursor: stepIndex >= totalSteps ? 'not-allowed' : 'pointer',
                  }}
                >
                  Passo Avanti
                </button>

                <button
                  type="button"
                  className="touch-target"
                  data-testid="replay-jump-end-btn"
                  disabled={stepIndex >= totalSteps}
                  onClick={() => {
                    onInteraction?.('end');
                    setIsPlaying(false);
                    setStepIndex(totalSteps);
                  }}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(233, 229, 214, 0.3)',
                    backgroundColor: 'var(--surface-card)',
                    color: 'var(--chalk)',
                    fontFamily: 'var(--font-numeric)',
                    fontWeight: 700,
                    cursor: stepIndex >= totalSteps ? 'not-allowed' : 'pointer',
                  }}
                >
                  Fine ({totalSteps})
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  flexWrap: 'wrap',
                  fontFamily: 'var(--font-numeric)',
                }}
              >
                <span
                  className="board-badge board-badge--brass"
                  data-testid="replay-step-indicator"
                >
                  Passo {stepIndex} / {totalSteps}
                </span>

                <span className="board-badge" data-testid="replay-state-version-badge">
                  Versione Stato: {currentView.stateVersion}
                </span>

                {activeStep !== null && (
                  <span
                    className="board-badge board-badge--muted"
                    data-testid="replay-step-hash-badge"
                    title={activeStep.stateHash}
                  >
                    SHA-256: {activeStep.stateHash.slice(0, 12)}…
                  </span>
                )}
              </div>
            </section>

            {/* Riepilogo Stato Proiettato e Eventi del Passo */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '14px',
              }}
            >
              {/* Colonna 1: Stato Tavolo al Passo Corrente */}
              <section
                aria-label="Stato del tavolo al passo selezionato"
                data-testid="replay-board-summary"
                style={{
                  padding: '16px 18px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--panel-soft)',
                  border: '1px solid var(--panel-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <strong className="font-display" style={{ fontSize: '1.05rem' }}>
                    {ERA_LABELS_IT[currentView.era]} · Fase: {currentView.phase}{' '}
                    {currentView.cycle > 0 ? `(Ciclo ${currentView.cycle})` : ''}
                  </strong>

                  <span
                    className="board-badge board-badge--brass"
                    data-testid="replay-final-result-badge"
                  >
                    Esito Partita: {replay.result.kind} (Vincitore: {replay.result.winner})
                  </span>
                </div>

                {/* Stato Self (P1 o P2 secondo prospettiva) */}
                <div
                  data-testid="replay-self-panel"
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--surface-card)',
                    border: '1px solid var(--panel-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontFamily: 'var(--font-numeric)',
                    }}
                  >
                    <strong>
                      Vista Principale ({selfId} — Prospettiva: {replay.perspective})
                    </strong>
                    <span>
                      <StatIcon stat="walls" size={13} /> Mura {currentView.self.walls} ·{' '}
                      <StatIcon stat="cityCenter" size={13} /> Centro Città{' '}
                      {currentView.self.cityHp}/{currentView.self.cityMax}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      flexWrap: 'wrap',
                      fontFamily: 'var(--font-numeric)',
                      fontSize: '0.88rem',
                    }}
                  >
                    {(['food', 'wood', 'metal'] as const).map((r) => (
                      <span
                        key={r}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <ResourceIcon resource={r} size={13} />
                        {RESOURCE_LABELS_IT[r]}: {currentView.self.resources[r]}
                      </span>
                    ))}
                    <span>· Mano visibile: {currentView.self.hand.length}</span>
                    <span>· Edifici visibili: {currentView.self.buildings.length}</span>
                    <span>· Unità visibili: {currentView.self.units.length}</span>
                  </div>

                  {currentView.self.hand.length > 0 && (
                    <div
                      data-testid="replay-self-hand-list"
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        marginTop: '4px',
                      }}
                    >
                      {currentView.self.hand.map((card) => (
                        <button
                          key={card.uid}
                          type="button"
                          onClick={() => onInspectCard?.(card.cardId)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--panel-border)',
                            backgroundColor: 'var(--panel)',
                            color: 'var(--chalk)',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          {CARDS_TEXT_IT[card.cardId]?.name ?? card.cardId}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stato Avversario */}
                <div
                  data-testid="replay-opponent-panel"
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--surface-card)',
                    border: '1px solid rgba(233, 229, 214, 0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontFamily: 'var(--font-numeric)',
                    }}
                  >
                    <strong>Avversario ({opponentId})</strong>
                    <span>
                      <StatIcon stat="walls" size={13} /> Mura {currentView.opponent.walls} ·{' '}
                      <StatIcon stat="cityCenter" size={13} /> Centro Città{' '}
                      {currentView.opponent.cityHp}/{currentView.opponent.cityMax}
                    </span>
                  </div>

                  <div
                    style={{
                      fontFamily: 'var(--font-numeric)',
                      fontSize: '0.88rem',
                      color: 'var(--chalk-muted)',
                    }}
                  >
                    Carte in mano: {currentView.opponent.handCount} · Carte coperte in Città:{' '}
                    {currentView.opponent.coveredCount} · Unita rivelate:{' '}
                    {currentView.opponent.units?.length ?? 0}
                  </div>
                </div>
              </section>

              {/* Colonna 2: Dettaglio Comando ed Eventi del Passo */}
              <section
                aria-label="Comando ed eventi del passo selezionato"
                data-testid="replay-events-panel"
                style={{
                  padding: '16px 18px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--panel-soft)',
                  border: '1px solid var(--panel-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <header
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <strong className="font-display" style={{ fontSize: '1.05rem' }}>
                    {activeStep === null
                      ? 'Apertura Partita (Passo 0)'
                      : `Passo ${activeStep.idx + 1}: ${activeStep.player} → ${activeStep.command.type}`}
                  </strong>
                  <span className="board-badge">{currentStepEvents.length} eventi proiettati</span>
                </header>

                <div
                  data-testid="replay-step-events-list"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    maxHeight: '260px',
                    overflowY: 'auto',
                  }}
                >
                  {currentStepEvents.length === 0 ? (
                    <div
                      style={{
                        fontSize: '0.88rem',
                        color: 'var(--chalk-muted)',
                        fontStyle: 'italic',
                      }}
                    >
                      Nessun evento visibile per questa prospettiva in questo passo.
                    </div>
                  ) : (
                    currentStepEvents.map((ev) => (
                      <div
                        key={ev.n}
                        data-testid={`replay-event-${ev.n}`}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          backgroundColor: 'var(--surface-card)',
                          borderLeft: '3px solid var(--brass)',
                          fontSize: '0.88rem',
                        }}
                      >
                        <strong
                          className="font-numeric"
                          style={{
                            color: 'var(--brass)',
                            marginRight: '6px',
                          }}
                        >
                          #{ev.n}
                        </strong>
                        <span>{describeEvent(ev, 'it',catalogVersion)}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
