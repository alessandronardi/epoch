import { useBattlePresentation } from './use-battle-presentation.js';
import { ERA_ROMAN_LABELS } from '../icons/DomainIcons.js';
import type { PlayerView } from '@epochs/engine';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  useGameStore,
  getBattleStageCode,
  type BattleLogEntry,
  type BattleStageCode,
  type PlaybackSpeed,
} from '../../state/game-store.js';

export interface BattleStageDescriptor {
  readonly code: BattleStageCode;
  readonly shortLabel: string;
  readonly fullLabel: string;
}

export const BATTLE_STAGE_DESCRIPTORS: readonly BattleStageDescriptor[] = Object.freeze([
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
  readonly onLogConsulted?: (() => void) | undefined;
  readonly playbackControls?:
    Pick<BattlePlaybackBarProps, 'onTogglePause' | 'onSetSpeed' | 'onSkipToEnd'> | undefined;
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
  const skippedStages = useGameStore((s) => s.skippedBattleStages);
  const setPlaybackSpeed = useGameStore((s) => s.setPlaybackSpeed);
  const togglePausePlayback = useGameStore((s) => s.togglePausePlayback);
  const skipToEnd = useGameStore((s) => s.skipToEnd);

  const activeBattleStage = propActiveStage !== undefined ? propActiveStage : storeActiveStage;
  const activeBattleStageCode = propActiveCode !== undefined ? propActiveCode : storeActiveCode;
  const scannedBattleStages =
    propScannedStages !== undefined ? propScannedStages : storeScannedStages;
  const speed = propSpeed !== undefined ? propSpeed : storeSpeed;
  const isPaused = propIsPaused !== undefined ? propIsPaused : storeIsPaused;
  const isPlaying = propIsPlaying !== undefined ? propIsPlaying : storeIsPlaying;
  const queueLength = propQueueLength !== undefined ? propQueueLength : storeQueueLength;

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
            activeBattleStage !== null ? 'board-badge--brass' : 'board-badge--muted'
          }`}
          data-testid="battle-active-stage-indicator"
          data-stage-code={activeBattleStageCode ?? ''}
        >
          {activeBattleStage ??
            (scannedBattleStages.length > 0 || Object.keys(skippedStages).length > 0
              ? 'Battaglia conclusa'
              : 'Preparazione della battaglia')}
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
          const isCurrent = isPlaying && activeBattleStageCode === desc.code;
          const isScanned = scannedBattleStages.includes(desc.code);
          const skipReason = skippedStages[desc.code];
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
              data-status={
                isCurrent ? 'active' : isScanned ? 'resolved' : skipReason ? 'skipped' : 'pending'
              }
              title={skipReason}
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
                {isCurrent
                  ? 'In corso'
                  : isScanned
                    ? 'Risolta'
                    : skipReason
                      ? `Saltata: ${skipReason}`
                      : 'In attesa'}
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
            backgroundColor: speed === 1 ? 'var(--brass, #B58E48)' : 'var(--surface-card, #223444)',
            color: speed === 1 ? 'var(--table-deep, #141E27)' : 'var(--chalk, #E9E5D6)',
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
            backgroundColor: speed === 2 ? 'var(--brass, #B58E48)' : 'var(--surface-card, #223444)',
            color: speed === 2 ? 'var(--table-deep, #141E27)' : 'var(--chalk, #E9E5D6)',
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
            backgroundColor: isPaused ? 'rgba(181, 142, 72, 0.28)' : 'var(--surface-card, #223444)',
            color: 'var(--chalk, #E9E5D6)',
            fontFamily: 'var(--font-numeric)',
            fontSize: '0.84rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {isPaused ? 'Riprendi' : 'Pausa'}
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
            backgroundColor: canSkip ? 'var(--surface-card, #223444)' : 'rgba(20, 30, 39, 0.45)',
            color: canSkip ? 'var(--chalk, #E9E5D6)' : 'var(--chalk-muted, #A7B4C2)',
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
  latestAnnouncement: propAnnouncement,
  playbackControls,
  onLogConsulted,
}: BattlePlaybackAndLogProps): ReactElement {
  const storeView = useGameStore((s) => s.presentationView ?? s.view);
  const storeLog = useGameStore((s) => s.battleLog);
  const storeAnnouncement = useGameStore((s) => s.latestAnnouncement);
  const battleEra = useGameStore((s) => s.battleEra);
  const notice = useGameStore((s) => s.playbackNotice);
  const view = propView !== undefined ? propView : storeView;
  const battleLog = propBattleLog ?? storeLog;
  const announcement = propAnnouncement ?? storeAnnouncement;
  const battleScene = useBattlePresentation(view);
  const [chosenEra, setChosenEra] = useState<number | null>(null);
  const [showDevelopment, setShowDevelopment] = useState(false);
  const [unread, setUnread] = useState(0);
  const region = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const lastCount = useRef(0);
  const eras = [...new Set(battleLog.map((entry) => entry.era))].sort();
  const era = chosenEra ?? battleEra ?? view?.era ?? 1;
  const eraLog = battleLog.filter((entry) => entry.era === era);
  const beginning = eraLog.find(
    (entry) => entry.type === 'UnitsRevealed' || entry.type === 'BattleStarted',
  )?.n;
  const entries = eraLog.filter((entry) =>
    showDevelopment
      ? beginning === undefined || entry.n < beginning
      : beginning !== undefined &&
        entry.n >= beginning &&
        entry.type !== 'EraStarted' &&
        entry.type !== 'CardsDrawn' &&
        entry.type !== 'CycleStarted',
  );
  const lastId = entries.at(-1)?.id;
  useEffect(() => {
    if (following.current && region.current) {
      region.current.scrollTop = region.current.scrollHeight;
      setUnread(0);
    } else {
      const added = Math.max(0, entries.length - lastCount.current);
      setUnread((previous) => previous + added);
    }
    lastCount.current = entries.length;
  }, [lastId, entries.length, chosenEra, showDevelopment]);

  if (!battleScene && battleLog.length === 0) return <></>;
  const outcome = entries.find((entry) => entry.event.type === 'BattleOutcome');
  const phases = entries.flatMap((entry) =>
    entry.event.type === 'BattlePhaseResolved' ? [entry.event] : [],
  );
  const siege = entries.find((entry) => entry.event.type === 'SiegeResolved');
  const raid = entries.find((entry) => entry.event.type === 'RaidResolved');
  const skippedLabels = outcome
    ? BATTLE_STAGE_DESCRIPTORS.filter(
        (stage) =>
          stage.code !== '4' && !phases.some((phase) => getBattleStageCode(phase) === stage.code),
      ).map((stage) => stage.fullLabel)
    : [];
  const groups: { label: string; entries: BattleLogEntry[] }[] = [];
  for (const entry of entries) {
    const label =
      entry.stageLabel ??
      (entry.type === 'BattleOutcome'
        ? 'Esito campale'
        : entry.type === 'EraEnded' || entry.type === 'GameEnded'
          ? 'Conclusione'
          : showDevelopment
            ? 'Sviluppo'
            : 'Preparazione');
    if (groups.at(-1)?.label !== label) groups.push({ label, entries: [] });
    groups.at(-1)!.entries.push(entry);
  }
  return (
    <div
      onFocusCapture={onLogConsulted}
      className="battle-playback-and-log"
      data-testid="battle-playback-and-log"
      tabIndex={0}
      aria-label="Riproduzione e Registro di Battaglia"
    >
      {battleScene && <BattlePlaybackBar {...playbackControls} />}
      {notice && <p role="status">{notice}</p>}
      <section
        aria-label="Registro di Battaglia"
        className="board-zone battle-log-panel"
        data-testid="battle-log-panel"
      >
        <header className="board-zone__header">
          <span className="board-zone__title">Registro di Battaglia</span>
          <span className="board-zone__count" data-testid="battle-log-count">
            {entries.length} eventi
          </span>
        </header>
        <div className="battle-log-filters">
          <label>
            Era{' '}
            <select
              aria-label="Era del registro"
              value={era}
              onChange={(event) => {
                following.current = true;
                setChosenEra(Number(event.target.value));
              }}
            >
              {[...new Set([...eras, era])].sort().map((value) => (
                <option key={value} value={value}>
                  {ERA_ROMAN_LABELS[value as 1 | 2 | 3]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="touch-target"
            aria-pressed={showDevelopment}
            onClick={() => {
              following.current = true;
              setShowDevelopment(!showDevelopment);
            }}
          >
            {showDevelopment ? 'Mostra battaglia' : 'Mostra sviluppo'}
          </button>
        </div>
        {outcome && !showDevelopment && (
          <div
            className="battle-summary"
            data-testid="battle-summary"
            aria-label="Riepilogo battaglia"
          >
            <strong>{outcome.text}</strong>
            {skippedLabels.length > 0 && (
              <p>Fasi saltate perché la battaglia era già conclusa: {skippedLabels.join(', ')}.</p>
            )}
            {outcome.event.type === 'BattleOutcome' && outcome.event.kind !== 'winner' && (
              <p>Assedio e Razzia non previsti: nessun vincitore campale.</p>
            )}
            <p>
              Perdite: P1 {phases.reduce((sum, phase) => sum + phase.casualties.P1.length, 0)} · P2{' '}
              {phases.reduce((sum, phase) => sum + phase.casualties.P2.length, 0)}.
            </p>
            {siege && <p>{siege.text}</p>}
            {raid && <p>{raid.text}</p>}
          </div>
        )}
        <div
          className="sr-only"
          aria-live="polite"
          aria-atomic="true"
          data-testid="battle-log-live-announcer"
        >
          {announcement}
        </div>
        {unread > 0 && (
          <button
            type="button"
            className="touch-target battle-log-follow"
            onClick={() => {
              following.current = true;
              if (region.current) region.current.scrollTop = region.current.scrollHeight;
              setUnread(0);
            }}
          >
            {unread} nuovi eventi · Vai in fondo
          </button>
        )}
        <div
          ref={region}
          role="log"
          tabIndex={0}
          aria-label="Eventi del registro"
          aria-live="polite"
          aria-relevant="additions text"
          className="battle-log-region"
          data-testid="battle-log-region"
          onScroll={() => {
            const node = region.current;
            if (node) {
              following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 24;
              if (following.current) setUnread(0);
            }
          }}
        >
          {entries.length === 0 ? (
            <p className="board-zone__empty" data-testid="battle-log-empty">
              {showDevelopment
                ? 'Nessun evento di Sviluppo in questa Era.'
                : 'Nessun evento di battaglia in questa Era.'}
            </p>
          ) : (
            groups.map((group, index) => (
              <section key={`${group.label}-${index}`} aria-label={group.label}>
                <h3 className="battle-log-group-title">{group.label}</h3>
                {group.entries.map((entry) => (
                  <article
                    key={entry.id}
                    className="battle-log-entry"
                    data-testid={`battle-log-entry-${entry.n}`}
                    data-event-type={entry.type}
                  >
                    <small>
                      #{entry.n} · Era {ERA_ROMAN_LABELS[entry.era]}
                    </small>
                    <div>{entry.text}</div>
                    {!!entry.details?.length && (
                      <details>
                        <summary>Calcoli e bersagli</summary>
                        <ul>
                          {entry.details.map((detail, detailIndex) => (
                            <li key={detailIndex}>{detail}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </article>
                ))}
              </section>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
