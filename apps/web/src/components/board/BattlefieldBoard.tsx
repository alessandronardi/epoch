import { BoardCardInspection } from '../card/BoardCardInspection.js';
import { useBattlePresentation } from './use-battle-presentation.js';
import { getOpponent, type CardInstance, type Phase, type PlayerView } from '@epochs/engine';
import { Menu } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useGameStore } from '../../state/game-store.js';
import { CardInspectModal } from '../card/CardInspectModal.js';
import { ERA_ROMAN_LABELS } from '../icons/DomainIcons.js';
import { PlayerResources, PlayerStatus } from './PlayerStatus.js';
import { BoardPreferences } from './BoardPreferences.js';
import { CityAndLines, type DisplayUnit } from './CityAndLines.js';
import './board.css';

export const PHASE_LABELS_IT: Readonly<Record<Phase, string>> = Object.freeze({
  mulligan: 'Mulligan Iniziale',
  hand_limit: 'Limite di Mano',
  development: 'Sviluppo',
  prebattle: 'Pre-Battaglia',
  finished: 'Partita Conclusa',
});

export interface BattlefieldBoardProps {
  readonly view?: PlayerView | null | undefined;
  readonly isDroppableOverSelfCity?: boolean | undefined;
  readonly selectedBuildingUid?: string | null | undefined;
  readonly onSelectBuilding?: ((building: CardInstance) => void) | undefined;
  readonly onSelectUnit?: ((unit: DisplayUnit) => void) | undefined;
  readonly onInspectCard?: ((cardId: string) => void) | undefined;
  readonly handSlot?: ReactNode | undefined;
  readonly actionControlsSlot?: ReactNode | undefined;
  readonly sidebarSlot?: ReactNode | undefined;
  readonly overlaySlot?: ReactNode | undefined;
}

export function BattlefieldBoard({
  view: propView,
  isDroppableOverSelfCity = false,
  selectedBuildingUid,
  onSelectBuilding,
  onSelectUnit,
  onInspectCard,
  handSlot,
  actionControlsSlot,
  sidebarSlot,
  overlaySlot,
}: BattlefieldBoardProps): ReactElement {
  const storeView = useGameStore((s) => s.presentationView ?? s.view);
  const revealedUnitUids = useGameStore((s) => s.revealedUnitUids);
  const isRevealingUnits = useGameStore((s) => s.isRevealingUnits);
  const playbackUnits = useGameStore((s) => s.playbackUnits);
  const hasPlaybackSnapshot = useGameStore((s) => s.hasPlaybackSnapshot);
  const activeBattleStage = useGameStore((s) => s.activeBattleStage);
  const isPlaying = useGameStore((s) => s.isPlaying);
  const isPaused = useGameStore((s) => s.isPaused);
  const playbackMoment = useGameStore((s) => s.playbackMoment);
  const togglePausePlayback = useGameStore((s) => s.togglePausePlayback);
  const battleLog = useGameStore((s) => s.battleLog);
  const latestAnnouncement = useGameStore((s) => s.latestAnnouncement);
  const inspectedCardId = useGameStore((s) => s.inspectedCardId);
  const setInspectedCardId = useGameStore((s) => s.setInspectedCardId);
  const mobileDrawerOpen = useGameStore((s) => s.mobileDrawerOpen);
  const toggleMobileDrawer = useGameStore((s) => s.toggleMobileDrawer);
  const setMobileDrawerOpen = useGameStore((s) => s.setMobileDrawerOpen);

  const view = propView !== undefined ? propView : storeView;

  const handleInspect = (cardId: string): void => {
    if (onInspectCard) {
      onInspectCard(cardId);
      return;
    }
    setInspectedCardId(cardId);
  };

  const battleScene = useBattlePresentation(view);

  if (view === null) {
    return (
      <main className="cartographer-table battlefield-board" data-testid="battlefield-board-empty">
        <div className="board-zone__empty">
          In attesa dell&apos;avvio della partita sul Tavolo del Cartografo...
        </div>
      </main>
    );
  }

  const selfId = view.me;
  const opponentId = getOpponent(selfId);
  const isBattlePlaybackActive = isPlaying && battleScene;

  return (
    <BoardCardInspection>
      <main
        className="cartographer-table battlefield-board"
        data-testid="battlefield-board"
        data-scene={battleScene ? 'battle' : 'economy'}
        data-era={String(view.era)}
        data-phase={view.phase}
        data-is-playing={String(isPlaying)}
        data-playback-moment={playbackMoment ?? ''}
      >
        <div className="board-scenery" aria-hidden="true">
          {['economy', 'battle'].map((scene) => (
            <div
              key={scene}
              className="board-scenery__layer"
              data-active={scene === (battleScene ? 'battle' : 'economy')}
              style={{
                backgroundImage: `url(/board-art/${scene === 'battle' ? 'battle' : 'table-landscape'}.webp)`,
              }}
            />
          ))}
        </div>
        {/* Annunciatore screen-reader sincronizzato con gli eventi (§9.5 riga 828) */}
        <div
          className="sr-only"
          aria-live="polite"
          aria-atomic="true"
          data-testid="board-live-announcer"
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

        <div className="battlefield-board__main">
          <section
            className="board-center-divider"
            data-testid="board-center-divider"
            aria-label="Stato Era e Turno"
          >
            <div className="board-center-divider__era">
              <span data-testid="board-era-label">Era {ERA_ROMAN_LABELS[view.era]}</span>
              <span
                data-testid="board-phase-label"
                className={
                  view.phase === 'development' && activeBattleStage === null ? 'sr-only' : undefined
                }
              >
                {activeBattleStage !== null
                  ? activeBattleStage
                  : view.phase === 'development'
                    ? `Ciclo ${view.cycle}`
                    : PHASE_LABELS_IT[view.phase]}
              </span>
            </div>

            <div
              className={`board-center-divider__turn ${
                view.self.legal.canAct ? 'board-center-divider__turn--active' : ''
              }`.trim()}
              data-testid="board-turn-indicator"
            >
              {isBattlePlaybackActive ? (
                <>
                  <span role="status">
                    {isPaused
                      ? 'Battaglia in pausa'
                      : playbackMoment === 'announce'
                        ? 'Preparazione della fase'
                        : playbackMoment === 'impact'
                          ? 'Danni simultanei'
                          : playbackMoment === 'result'
                            ? 'Esito della fase'
                            : 'Risoluzione in corso'}
                  </span>
                  <button
                    type="button"
                    className="touch-target battle-field-pause"
                    data-testid="battle-field-pause"
                    aria-pressed={isPaused}
                    onClick={togglePausePlayback}
                  >
                    {isPaused ? 'Riprendi' : 'Pausa'}
                  </button>
                </>
              ) : isPlaying ? (
                'Aggiornamento del tavolo'
              ) : view.phase === 'finished' ? (
                'Partita terminata'
              ) : view.self.legal.canAct ? (
                'Tocca a te'
              ) : (
                'Turno avversario'
              )}
            </div>
            <button
              type="button"
              className="board-mobile-drawer-btn touch-target"
              data-testid="mobile-drawer-toggle"
              aria-expanded={mobileDrawerOpen}
              aria-label={
                battleScene || battleLog.length > 0
                  ? 'Apri Registro e menu partita'
                  : 'Apri menu partita'
              }
              onClick={toggleMobileDrawer}
            >
              <Menu size={23} aria-hidden="true" />
            </button>
          </section>

          <section
            className="board-player-field board-player-field--opponent"
            aria-label="Campo avversario"
          >
            <PlayerStatus view={view} side="opponent" />
            <CityAndLines
              side="opponent"
              view={view}
              revealedUnitUids={revealedUnitUids}
              isRevealingUnits={isRevealingUnits}
              playbackUnits={playbackUnits[opponentId]}
              isBattlePlaybackActive={isBattlePlaybackActive}
              hasPlaybackSnapshot={hasPlaybackSnapshot}
              onInspectCard={handleInspect}
              onSelectUnit={onSelectUnit}
            />
          </section>
          <section
            className="board-player-field board-player-field--self"
            data-active={view.self.legal.canAct}
            aria-label="Il tuo campo"
          >
            <PlayerStatus view={view} side="self" />
            <CityAndLines
              side="self"
              view={view}
              revealedUnitUids={revealedUnitUids}
              isRevealingUnits={isRevealingUnits}
              playbackUnits={playbackUnits[selfId]}
              isBattlePlaybackActive={isBattlePlaybackActive}
              hasPlaybackSnapshot={hasPlaybackSnapshot}
              selectedBuildingUid={selectedBuildingUid}
              isDroppableOver={isDroppableOverSelfCity}
              onInspectCard={handleInspect}
              onSelectBuilding={onSelectBuilding}
              onSelectUnit={onSelectUnit}
            />
          </section>
          <div className="board-action-dock">
            <PlayerResources view={view} />
            {actionControlsSlot}
          </div>
          {handSlot !== null && (
            <footer className="board-hand-dock" data-testid="board-hand-dock">
              {handSlot}
            </footer>
          )}
        </div>

        {/* Colonna Laterale / Cassetto Mobile per Controlli, Registro e Sotto-Mazzi (§9.2, §9.6) */}
        <aside
          className={`battlefield-board__sidebar ${
            mobileDrawerOpen ? 'battlefield-board__sidebar--drawer-open' : ''
          }`.trim()}
          data-testid="board-sidebar"
          aria-label="Menu partita e Registro"
        >
          {(mobileDrawerOpen || !battleScene) && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <strong className="font-display">Menu partita</strong>
              <button
                type="button"
                className="board-mobile-drawer-btn touch-target"
                data-testid="mobile-drawer-close"
                onClick={() => setMobileDrawerOpen(false)}
              >
                Chiudi
              </button>
            </div>
          )}

          <BoardPreferences />

          {sidebarSlot ??
            (battleScene && (
              <>
                <div className="board-zone" style={{ flex: 1 }}>
                  <header className="board-zone__header">
                    <span className="board-zone__title">Registro di Battaglia</span>
                    <span className="board-zone__count">{battleLog.length} eventi</span>
                  </header>
                  <div
                    className="board-zone__content"
                    style={{ flexDirection: 'column', alignItems: 'stretch' }}
                    data-testid="board-default-log-list"
                  >
                    {battleLog.length === 0 ? (
                      <div className="board-zone__empty">Nessun evento registrato.</div>
                    ) : (
                      battleLog.map((entry) => (
                        <div
                          key={entry.id}
                          style={{
                            fontSize: '0.82rem',
                            padding: '3px 0',
                            borderBottom: '1px solid rgba(233, 229, 214, 0.08)',
                          }}
                        >
                          {entry.text}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            ))}
        </aside>

        {overlaySlot}

        {/* Modale globale di ispezione carta con tooltip parole chiave (§9.3, §9.6) */}
        <CardInspectModal cardId={inspectedCardId} onClose={() => setInspectedCardId(null)} />
      </main>
    </BoardCardInspection>
  );
}
