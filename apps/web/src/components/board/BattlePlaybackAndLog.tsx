import { getCard } from '@epochs/content';
import type { EraNo, PlayerView } from '@epochs/engine';
import type { ReactElement } from 'react';
import {
  useGameStore,
  type BattleLogEntry,
  type BattleStageCode,
  type PlaybackSpeed,
} from '../../state/game-store.js';
import { ERA_ROMAN_LABELS } from '../icons/DomainIcons.js';

export interface BattleStageDescriptor {
  readonly code: BattleStageCode;
  readonly shortLabel: string;
  readonly fullLabel: string;
}

export const BATTLE_STAGE_DESCRIPTORS: readonly BattleStageDescriptor[] =
  Object.freeze([
    {
      code: '1',
      shortLabel: 'Fase 1: Tiro',
      fullLabel: 'Fase 1: Tiro',
    },
    {
      code: '2A',
      shortLabel: 'Fase 2A: Impalamento',
      fullLabel: 'Fase 2A: Impalamento',
    },
    {
      code: '2B',
      shortLabel: 'Fase 2B: Impatto/Accerchiamento',
      fullLabel: 'Fase 2B: Impatto/Accerchiamento',
    },
    {
      code: '3',
      shortLabel: 'Fase 3: Mischia Ciclo 1/6',
      fullLabel: 'Fase 3: Mischia Ciclo 1/6',
    },
    {
      code: '4',
      shortLabel: 'Fase 4: Assedio e Razzia',
      fullLabel: 'Fase 4: Assedio e Razzia',
    },
  ]);

const ERA_SEQUENCE: readonly EraNo[] = [1, 2, 3];

export interface BattlePlaybackBarProps {
  readonly activeBattleStage?: string | null | undefined;
  readonly activeBattleStageCode?: BattleStageCode | null | undefined;
  readonly scannedBattleStages?: readonly BattleStageCode[] | undefined;
  readonly speed?: PlaybackSpeed | undefined;
  readonly isPaused?: boolean | undefined;
  readonly isPlaying?: boolean | undefined;
  readonly queueLength?: number | undefined;
  readonly onSetSpeed?: ((speed: PlaybackSpeed) => void) | undefined;
  readonly onTogglePause?: (() => void) | undefined;
  readonly onSkipToEnd?: (() => void) | undefined;
}

export interface BattlePlaybackAndLogProps {
  readonly view?: PlayerView | null | undefined;
  readonly battleLog?: readonly BattleLogEntry[] | undefined;
  readonly latestAnnouncement?: string | undefined;
  readonly onInspectCard?: ((cardId: string) => void) | undefined;
}

/**
 * Barra di controllo `EventPlayer` (§9.4 riga 821, §9.5 righe 823–828):
 * mostra la scansione delle 5 fasi di battaglia/assedio (1, 2A, 2B, 3, 4),
 * l'etichetta della fase attiva e i controlli 1x, 2x, Pausa e "Salta alla fine".
 */
export function BattlePlaybackBar({
  activeBattleStage: propActiveStage,
  activeBattleStageCode: propActiveCode,
  scannedBattleStages: propScannedStages,
  speed: propSpeed,
  isPaused: propIsPaused,
  isPlaying: propIsPlaying,
  queueLength: propQueueLength,
  onSetSpeed,
  onTogglePause,
  onSkipToEnd,
}: BattlePlaybackBarProps): ReactElement {
  const storeActiveStage = useGameStore((s) => s.activeBattleStage);
  const storeActiveCode = useGameStore((s) => s.activeBattleStageCode);
  const storeScannedStages = useGameStore((s) => s.scannedBattleStages);
  const storeSpeed = useGameStore((s) => s.speed);
  const storeIsPaused = useGameStore((s) => s.isPaused);
  const storeIsPlaying = useGameStore((s) => s.isPlaying);
  const storeQueueLength = useGameStore((s) => s.queue.length);
  const setPlaybackSpeed = useGameStore((s) => s.setPlaybackSpeed);
  const togglePausePlayback = useGameStore((s) => s.togglePausePlayback);
  const skipToEnd = useGameStore((s) => s.skipToEnd);

  const activeBattleStage =
    propActiveStage !== undefined ? propActiveStage : storeActiveStage;
  const activeBattleStageCode =
    propActiveCode !== undefined ? propActiveCode : storeActiveCode;
  const scannedBattleStages =
    propScannedStages !== undefined ? propScannedStages : storeScannedStages;
  const speed = propSpeed !== undefined ? propSpeed : storeSpeed;
  const isPaused = propIsPaused !== undefined ? propIsPaused : storeIsPaused;
  const isPlaying = propIsPlaying !== undefined ? propIsPlaying : storeIsPlaying;
  const queueLength =
    propQueueLength !== undefined ? propQueueLength : storeQueueLength;

  const handleSpeedChange = (nextSpeed: PlaybackSpeed): void => {
    if (onSetSpeed) {
      onSetSpeed(nextSpeed);
      return;
    }
    setPlaybackSpeed(nextSpeed);
  };

  const handlePauseToggle = (): void => {
    if (onTogglePause) {
      onTogglePause();
      return;
    }
    togglePausePlayback();
  };

  const handleSkip = (): void => {
    if (onSkipToEnd) {
      onSkipToEnd();
      return;
    }
    skipToEnd();
  };

  const canSkip = isPlaying || queueLength > 0;

  return (
    <section
      aria-label="Controlli riproduzione EventPlayer e Fase di Battaglia"
      className="board-zone battle-playback-bar"
      data-testid="battle-playback-bar"
      data-is-playing={isPlaying ? 'true' : 'false'}
      data-is-paused={isPaused ? 'true' : 'false'}
      data-speed={String(speed)}
      style={{
        height: 'auto',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '8px 10px',
      }}
    >
      <header className="board-zone__header" style={{ marginBottom: 0 }}>
        <span className="board-zone__title">EventPlayer · Risoluzione</span>
        <span
          className={`board-badge ${
            activeBattleStage !== null
              ? 'board-badge--brass'
              : 'board-badge--muted'
          }`}
          data-testid="battle-active-stage-indicator"
          data-stage-code={activeBattleStageCode ?? ''}
        >
          {activeBattleStage ?? 'Sviluppo / Attesa Battaglia'}
        </span>
      </header>

      {/* Scansione ordinata delle fasi 1, 2A, 2B, 3, 4 (§9.4 riga 821) */}
      <div
        role="list"
        aria-label="Scansione fasi della Battaglia Campale e Assedio"
        data-testid="battle-stages-track"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        {BATTLE_STAGE_DESCRIPTORS.map((desc) => {
          const isCurrent = activeBattleStageCode === desc.code;
          const isScanned = scannedBattleStages.includes(desc.code);
          const dynamicLabel =
            desc.code === '3' &&
            activeBattleStage !== null &&
            activeBattleStage.startsWith('Fase 3: Mischia Ciclo')
              ? activeBattleStage
              : desc.fullLabel;

          return (
            <div
              key={desc.code}
              role="listitem"
              data-testid={`battle-stage-step-${desc.code}`}
              data-active={isCurrent ? 'true' : 'false'}
              data-scanned={isScanned ? 'true' : 'false'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
                padding: '3px 7px',
                borderRadius: '4px',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-numeric)',
                fontWeight: isCurrent ? 700 : 600,
                backgroundColor: isCurrent
                  ? 'rgba(181, 142, 72, 0.24)'
                  : isScanned
                    ? 'rgba(34, 52, 68, 0.7)'
                    : 'rgba(20, 30, 39, 0.45)',
                border: isCurrent
                  ? '1px solid var(--brass, #B58E48)'
                  : isScanned
                    ? '1px solid rgba(181, 142, 72, 0.35)'
                    : '1px solid rgba(233, 229, 214, 0.1)',
                color: isCurrent
                  ? 'var(--chalk, #E9E5D6)'
                  : isScanned
                    ? 'var(--chalk, #E9E5D6)'
                    : 'var(--chalk-muted, #A7B4C2)',
              }}
            >
              <span>{dynamicLabel}</span>
              <span style={{ fontSize: '0.72rem' }}>
                {isCurrent ? 'In corso' : isScanned ? 'Risolta' : '—'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Controlli di riproduzione sempre visibili: 1x, 2x, Pausa, "Salta alla fine" (§9.5 riga 826) */}
      <div
        role="group"
        aria-label="Controlli velocità e avanzamento EventPlayer"
        data-testid="event-player-controls"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '6px',
        }}
      >
        <button
          type="button"
          className="touch-target"
          data-testid="playback-speed-1x"
          aria-pressed={speed === 1}
          aria-label="Velocità riproduzione 1x"
          onClick={() => handleSpeedChange(1)}
          style={{
            padding: '6px 8px',
            borderRadius: '5px',
            border:
              speed === 1
                ? '1.5px solid var(--brass, #B58E48)'
                : '1px solid rgba(233, 229, 214, 0.25)',
            backgroundColor:
              speed === 1
                ? 'var(--brass, #B58E48)'
                : 'var(--surface-card, #223444)',
            color:
              speed === 1
                ? 'var(--table-deep, #141E27)'
                : 'var(--chalk, #E9E5D6)',
            fontFamily: 'var(--font-numeric)',
            fontSize: '0.86rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          1x
        </button>

        <button
          type="button"
          className="touch-target"
          data-testid="playback-speed-2x"
          aria-pressed={speed === 2}
          aria-label="Velocità riproduzione 2x"
          onClick={() => handleSpeedChange(2)}
          style={{
            padding: '6px 8px',
            borderRadius: '5px',
            border:
              speed === 2
                ? '1.5px solid var(--brass, #B58E48)'
                : '1px solid rgba(233, 229, 214, 0.25)',
            backgroundColor:
              speed === 2
                ? 'var(--brass, #B58E48)'
                : 'var(--surface-card, #223444)',
            color:
              speed === 2
                ? 'var(--table-deep, #141E27)'
                : 'var(--chalk, #E9E5D6)',
            fontFamily: 'var(--font-numeric)',
            fontSize: '0.86rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          2x
        </button>

        <button
          type="button"
          className="touch-target"
          data-testid="playback-pause-btn"
          aria-pressed={isPaused}
          aria-label={isPaused ? 'Riprendi riproduzione' : 'Metti in Pausa'}
          onClick={handlePauseToggle}
          style={{
            padding: '6px 8px',
            borderRadius: '5px',
            border: isPaused
              ? '1.5px solid var(--brass, #B58E48)'
              : '1px solid rgba(233, 229, 214, 0.25)',
            backgroundColor: isPaused
              ? 'rgba(181, 142, 72, 0.28)'
              : 'var(--surface-card, #223444)',
            color: 'var(--chalk, #E9E5D6)',
            fontFamily: 'var(--font-numeric)',
            fontSize: '0.84rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Pausa
        </button>

        <button
          type="button"
          className="touch-target"
          data-testid="playback-skip-btn"
          disabled={!canSkip}
          onClick={handleSkip}
          style={{
            padding: '6px 8px',
            borderRadius: '5px',
            border: '1px solid var(--brass, #B58E48)',
            backgroundColor: canSkip
              ? 'var(--surface-card, #223444)'
              : 'rgba(20, 30, 39, 0.45)',
            color: canSkip
              ? 'var(--chalk, #E9E5D6)'
              : 'var(--chalk-muted, #A7B4C2)',
            fontFamily: 'var(--font-numeric)',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: canSkip ? 'pointer' : 'not-allowed',
            opacity: canSkip ? 1 : 0.65,
          }}
        >
          Salta alla fine
        </button>
      </div>
    </section>
  );
}

/**
 * Pannello completo della colonna laterale e del drawer mobile (§9.2, §9.4–§9.6):
 * integra `<BattlePlaybackBar>`, il riepilogo dei sotto-mazzi e scarti pubblici,
 * e il Registro di Battaglia sincronizzato con `aria-live="polite"`.
 */
export function BattlePlaybackAndLog({
  view: propView,
  battleLog: propBattleLog,
  latestAnnouncement: propLatestAnnouncement,
  onInspectCard,
}: BattlePlaybackAndLogProps): ReactElement {
  const storeView = useGameStore((s) => s.view);
  const storeBattleLog = useGameStore((s) => s.battleLog);
  const storeLatestAnnouncement = useGameStore((s) => s.latestAnnouncement);
  const setInspectedCardId = useGameStore((s) => s.setInspectedCardId);

  const view = propView !== undefined ? propView : storeView;
  const battleLog =
    propBattleLog !== undefined ? propBattleLog : storeBattleLog;
  const latestAnnouncement =
    propLatestAnnouncement !== undefined
      ? propLatestAnnouncement
      : storeLatestAnnouncement;

  const handleInspect = (cardId: string): void => {
    if (onInspectCard) {
      onInspectCard(cardId);
      return;
    }
    setInspectedCardId(cardId);
  };

  return (
    <div
      className="battle-playback-and-log"
      data-testid="battle-playback-and-log"
      tabIndex={0}
      aria-label="Pannello EventPlayer e Registro di Battaglia"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* 1. Controlli EventPlayer e indicatore Fase 1..4 */}
      <BattlePlaybackBar />

      {/* 2. Contatori Sotto-mazzi per Era e Scarti (§9.2 riga 796, §9.6 riga 837) */}
      {view !== null && (
        <section
          aria-label="Contatori Sotto-Mazzi e Scarti"
          className="board-zone"
          data-testid="subdecks-and-discards-panel"
          style={{
            height: 'auto',
            flexShrink: 0,
            padding: '8px 10px',
            gap: '6px',
          }}
        >
          <header className="board-zone__header" style={{ marginBottom: 0 }}>
            <span className="board-zone__title">Sotto-mazzi &amp; Scarti</span>
            <span className="board-zone__count">
              Era {ERA_ROMAN_LABELS[view.era]}
            </span>
          </header>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '4px',
              fontFamily: 'var(--font-numeric)',
              fontSize: '0.8rem',
            }}
          >
            {ERA_SEQUENCE.map((eraNo) => (
              <div
                key={eraNo}
                data-testid={`subdeck-counter-era-${eraNo}`}
                style={{
                  padding: '3px 6px',
                  borderRadius: '4px',
                  backgroundColor:
                    view.era === eraNo
                      ? 'rgba(181, 142, 72, 0.18)'
                      : 'rgba(20, 30, 39, 0.6)',
                  border:
                    view.era === eraNo
                      ? '1px solid var(--brass, #B58E48)'
                      : '1px solid rgba(233, 229, 214, 0.12)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  Era {ERA_ROMAN_LABELS[eraNo]}
                </div>
                <div style={{ color: 'var(--chalk-muted)' }}>
                  Tu: {view.self.subdeckCounts[eraNo]} · Avv:{' '}
                  {view.opponent.subdeckCounts[eraNo]}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.8rem',
              color: 'var(--chalk-muted)',
              fontFamily: 'var(--font-numeric)',
            }}
          >
            <span data-testid="self-discard-count">
              Tuoi scarti: {view.self.discard.length}
            </span>
            <span data-testid="opponent-discard-count">
              Scarti avv.: {view.opponent.discardCount} (pubblici:{' '}
              {view.opponent.publicDiscard.length})
            </span>
          </div>

          {view.opponent.publicDiscard.length > 0 && (
            <div
              data-testid="opponent-public-discard-list"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px',
                maxHeight: '56px',
                overflowY: 'auto',
              }}
            >
              {view.opponent.publicDiscard.slice(-6).map((cardId, idx) => {
                const c = getCard(cardId);
                return (
                  <button
                    key={`${cardId}-${idx}`}
                    type="button"
                    onClick={() => handleInspect(cardId)}
                    style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid rgba(181, 142, 72, 0.35)',
                      backgroundColor: 'var(--surface-card, #223444)',
                      color: 'var(--chalk, #E9E5D6)',
                      fontFamily: 'var(--font-numeric)',
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                    }}
                  >
                    {c.text.name}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 3. Registro di Battaglia testuale in italiano con aria-live="polite" (§9.5 riga 828) */}
      <section
        aria-label="Registro di Battaglia"
        className="board-zone"
        data-testid="battle-log-panel"
        style={{
          flex: 1,
          minHeight: '140px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: '8px 10px',
        }}
      >
        <header className="board-zone__header">
          <span className="board-zone__title">Registro di Battaglia</span>
          <span className="board-zone__count" data-testid="battle-log-count">
            {battleLog.length} eventi
          </span>
        </header>

        {/* Annuncio live sincrono per tecnologie assistive */}
        <div
          className="sr-only"
          aria-live="polite"
          aria-atomic="true"
          data-testid="battle-log-live-announcer"
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: 0,
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          {latestAnnouncement}
        </div>

        <div
          role="log"
          tabIndex={0}
          aria-live="polite"
          aria-relevant="additions text"
          className="board-zone__content"
          data-testid="battle-log-region"
          style={{
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: '5px',
            minHeight: '80px',
          }}
        >
          {battleLog.length === 0 ? (
            <div className="board-zone__empty" data-testid="battle-log-empty">
              Nessun evento registrato nel Registro di Battaglia.
            </div>
          ) : (
            battleLog.map((entry) => (
              <article
                key={entry.id}
                data-testid={`battle-log-entry-${entry.n}`}
                data-event-type={entry.type}
                style={{
                  padding: '5px 7px',
                  borderRadius: '4px',
                  backgroundColor:
                    entry.stageLabel !== null
                      ? 'rgba(181, 142, 72, 0.14)'
                      : 'rgba(20, 30, 39, 0.55)',
                  borderLeft:
                    entry.stageLabel !== null
                      ? '3px solid var(--brass, #B58E48)'
                      : '2px solid rgba(233, 229, 214, 0.2)',
                  fontSize: '0.82rem',
                  lineHeight: 1.35,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    fontFamily: 'var(--font-numeric)',
                    fontSize: '0.73rem',
                    color: 'var(--chalk-muted)',
                    marginBottom: '2px',
                  }}
                >
                  <span>
                    #{entry.n} · Era {ERA_ROMAN_LABELS[entry.era]}
                  </span>
                  {entry.stageLabel !== null && (
                    <span style={{ color: 'var(--brass)', fontWeight: 700 }}>
                      {entry.stageLabel}
                    </span>
                  )}
                </div>
                <div>{entry.text}</div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
