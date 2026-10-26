import {
  LOGISTICS_CAP_BY_ERA,
  STORAGE_CAP_BY_ERA,
  getOpponent,
  type CardInstance,
  type Phase,
  type PlayerView,
  type Resource,
} from '@epochs/engine';
import type { ReactElement, ReactNode } from 'react';
import { useGameStore } from '../../state/game-store.js';
import { CardInspectModal } from '../card/CardInspectModal.js';
import {
  ERA_LABELS_IT,
  ERA_ROMAN_LABELS,
  EraIcon,
  RESOURCE_LABELS_IT,
  ResourceIcon,
  StatIcon,
} from '../icons/DomainIcons.js';
import { CityAndLines, type DisplayUnit } from './CityAndLines.js';
import './board.css';

const RESOURCE_ORDER: readonly Resource[] = ['food', 'wood', 'metal'];

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
  const storeView = useGameStore((s) => s.view);
  const revealedUnitUids = useGameStore((s) => s.revealedUnitUids);
  const isRevealingUnits = useGameStore((s) => s.isRevealingUnits);
  const playbackUnits = useGameStore((s) => s.playbackUnits);
  const activeBattleStage = useGameStore((s) => s.activeBattleStage);
  const isPlaying = useGameStore((s) => s.isPlaying);
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

  if (view === null) {
    return (
      <main
        className="cartographer-table battlefield-board"
        data-testid="battlefield-board-empty"
      >
        <div className="board-zone__empty">
          In attesa dell&apos;avvio della partita sul Tavolo del Cartografo...
        </div>
      </main>
    );
  }

  const selfId = view.me;
  const opponentId = getOpponent(selfId);
  const storageCap = STORAGE_CAP_BY_ERA[view.era];
  const logisticsCap = LOGISTICS_CAP_BY_ERA[view.era];
  const isBattlePlaybackActive = isPlaying && activeBattleStage !== null;

  const selfCityDamaged = view.self.cityHp < view.self.cityMax;
  const opponentCityDamaged = view.opponent.cityHp < view.opponent.cityMax;

  return (
    <main
      className="cartographer-table battlefield-board"
      data-testid="battlefield-board"
      data-era={String(view.era)}
      data-phase={view.phase}
    >
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
        {/* 1. Barra Stato Avversario (§9.2 riga 780) */}
        <header
          className="board-status-bar board-status-bar--opponent"
          data-testid="opponent-status-bar"
          aria-label={`Stato Avversario (${opponentId})`}
        >
          <div className="board-status-bar__group">
            <span className="board-status-bar__identity">
              <span>Avversario ({opponentId})</span>
              {view.initiative === opponentId && (
                <span
                  className="board-badge board-badge--brass"
                  data-testid="opponent-initiative-badge"
                >
                  Iniziativa
                </span>
              )}
            </span>

            <span
              className="board-badge"
              data-testid="opponent-walls"
              aria-label={`Mura avversario: ${view.opponent.walls}`}
            >
              <StatIcon stat="walls" size={14} />
              <span>Mura {view.opponent.walls}</span>
            </span>

            <span
              className={`board-badge ${
                opponentCityDamaged ? 'board-badge--crimson' : ''
              }`.trim()}
              data-testid="opponent-city-hp"
              aria-label={`Centro Città avversario: ${view.opponent.cityHp} su ${view.opponent.cityMax}`}
            >
              <StatIcon stat="cityCenter" size={14} />
              <span>
                Centro Città {view.opponent.cityHp}/{view.opponent.cityMax}
              </span>
            </span>

            <span
              className="board-badge"
              data-testid="opponent-slots"
              aria-label={`Slot logistici avversario: ${view.opponent.slotsUsed} su ${logisticsCap}`}
            >
              Slot {view.opponent.slotsUsed}/{logisticsCap}
            </span>

            {view.opponent.demBonus > 0 && (
              <span
                className="board-badge board-badge--brass"
                data-testid="opponent-dem-bonus"
              >
                <StatIcon stat="dem" size={13} />
                <span>+{view.opponent.demBonus} DEM</span>
              </span>
            )}
          </div>

          <div className="board-status-bar__group">
            <div
              className="board-status-bar__group"
              data-testid="opponent-resources"
              aria-label="Risorse avversario"
            >
              {view.opponent.resources === null ? (
                <span
                  className="board-badge board-badge--muted"
                  data-testid="opponent-resources-hidden"
                >
                  Risorse nascoste
                </span>
              ) : (
                RESOURCE_ORDER.map((res) => (
                  <span
                    key={res}
                    className={`board-resource-pip board-resource-pip--${res}`}
                    data-testid={`opponent-resource-${res}`}
                    aria-label={`${RESOURCE_LABELS_IT[res]} avversario: ${view.opponent.resources?.[res] ?? 0} su ${storageCap}`}
                  >
                    <ResourceIcon resource={res} size={13} />
                    <span>
                      {view.opponent.resources?.[res] ?? 0}/{storageCap}
                    </span>
                  </span>
                ))
              )}
            </div>

            <span
              className="board-badge board-badge--muted"
              data-testid="opponent-counts"
            >
              Mano: {view.opponent.handCount} · Mazzi:{' '}
              {view.opponent.subdeckCounts[1]}/{view.opponent.subdeckCounts[2]}/
              {view.opponent.subdeckCounts[3]} · Scarti:{' '}
              {view.opponent.discardCount}
            </span>

            {view.opponent.passed && (
              <span
                className="board-badge board-badge--brass"
                data-testid="opponent-passed-badge"
              >
                Ha passato
              </span>
            )}

            {view.opponent.committed && (
              <span
                className="board-badge board-badge--brass"
                data-testid="opponent-committed-badge"
              >
                Scelta bloccata
              </span>
            )}

            <button
              type="button"
              className="board-mobile-drawer-btn touch-target"
              data-testid="mobile-drawer-toggle"
              aria-expanded={mobileDrawerOpen}
              aria-label="Apri Registro di Battaglia e contatori mazzi"
              onClick={toggleMobileDrawer}
            >
              Registro ({battleLog.length})
            </button>
          </div>
        </header>

        {/* 2. Metà Campo Avversario: Città Coperta + 3 Linee (§9.2 righe 781-784) */}
        <CityAndLines
          side="opponent"
          view={view}
          revealedUnitUids={revealedUnitUids}
          isRevealingUnits={isRevealingUnits}
          playbackUnits={playbackUnits[opponentId]}
          isBattlePlaybackActive={isBattlePlaybackActive}
          onInspectCard={handleInspect}
          onSelectUnit={onSelectUnit}
        />

        {/* 3. Fascia Divisoria Centrale: Era, Ciclo/Fase, Iniziativa e Turno (§9.2 riga 785) */}
        <section
          className="board-center-divider"
          data-testid="board-center-divider"
          aria-label="Stato Era e Turno"
        >
          <div className="board-center-divider__era">
            <EraIcon era={view.era} size={18} />
            <span data-testid="board-era-label">
              {ERA_LABELS_IT[view.era]}
            </span>
            <span>·</span>
            <span data-testid="board-phase-label">
              {activeBattleStage !== null
                ? activeBattleStage
                : view.phase === 'development'
                  ? `Ciclo ${view.cycle}`
                  : PHASE_LABELS_IT[view.phase]}
            </span>
          </div>

          <div
            className={`board-center-divider__turn ${
              view.self.legal.canAct
                ? 'board-center-divider__turn--active'
                : ''
            }`.trim()}
            data-testid="board-turn-indicator"
          >
            {view.phase === 'finished'
              ? 'Partita terminata'
              : view.self.legal.canAct
                ? 'Tocca a te'
                : `In attesa di ${opponentId}`}
          </div>
        </section>

        {/* 4. Metà Campo Giocatore: Città + 3 Linee (§9.2 righe 786-789) */}
        <CityAndLines
          side="self"
          view={view}
          revealedUnitUids={revealedUnitUids}
          isRevealingUnits={isRevealingUnits}
          playbackUnits={playbackUnits[selfId]}
          isBattlePlaybackActive={isBattlePlaybackActive}
          selectedBuildingUid={selectedBuildingUid}
          isDroppableOver={isDroppableOverSelfCity}
          onInspectCard={handleInspect}
          onSelectBuilding={onSelectBuilding}
          onSelectUnit={onSelectUnit}
        />

        {/* 5. Barra Stato Giocatore (§9.2 riga 790) */}
        <section
          className="board-status-bar board-status-bar--self"
          data-testid="self-status-bar"
          aria-label={`Il tuo stato (${selfId})`}
        >
          <div className="board-status-bar__group">
            <span className="board-status-bar__identity">
              <span>Tu ({selfId})</span>
              {view.initiative === selfId && (
                <span
                  className="board-badge board-badge--brass"
                  data-testid="self-initiative-badge"
                >
                  Iniziativa
                </span>
              )}
            </span>

            <div
              className="board-status-bar__group"
              data-testid="self-resources"
              aria-label="Le tue risorse"
            >
              {RESOURCE_ORDER.map((res) => (
                <span
                  key={res}
                  className={`board-resource-pip board-resource-pip--${res}`}
                  data-testid={`self-resource-${res}`}
                  aria-label={`${RESOURCE_LABELS_IT[res]}: ${view.self.resources[res]} su ${storageCap}`}
                >
                  <ResourceIcon resource={res} size={14} />
                  <span>
                    {RESOURCE_LABELS_IT[res]} {view.self.resources[res]}/
                    {storageCap}
                  </span>
                </span>
              ))}
            </div>

            <span
              className="board-badge"
              data-testid="self-slots"
              aria-label={`Slot logistici usati: ${view.self.slotsUsed} su ${logisticsCap}`}
            >
              Slot {view.self.slotsUsed}/{logisticsCap}
            </span>
          </div>

          <div className="board-status-bar__group">
            <span
              className="board-badge"
              data-testid="self-walls"
              aria-label={`Le tue Mura: ${view.self.walls}`}
            >
              <StatIcon stat="walls" size={14} />
              <span>Mura {view.self.walls}</span>
            </span>

            <span
              className={`board-badge ${
                selfCityDamaged ? 'board-badge--crimson' : ''
              }`.trim()}
              data-testid="self-city-hp"
              aria-label={`Il tuo Centro Città: ${view.self.cityHp} su ${view.self.cityMax}`}
            >
              <StatIcon stat="cityCenter" size={14} />
              <span>
                Centro Città {view.self.cityHp}/{view.self.cityMax}
              </span>
            </span>

            {view.self.demBonus > 0 && (
              <span
                className="board-badge board-badge--brass"
                data-testid="self-dem-bonus"
              >
                <StatIcon stat="dem" size={13} />
                <span>+{view.self.demBonus} DEM</span>
              </span>
            )}

            <span
              className="board-badge board-badge--muted"
              data-testid="self-counts"
            >
              Mano: {view.self.hand.length}/10 · Mazzi:{' '}
              {view.self.subdeckCounts[1]}/{view.self.subdeckCounts[2]}/
              {view.self.subdeckCounts[3]} · Scarti: {view.self.discard.length}
            </span>

            {view.self.passed && (
              <span
                className="board-badge board-badge--brass"
                data-testid="self-passed-badge"
              >
                Hai passato
              </span>
            )}
          </div>
        </section>

        {/* 6. Dock Mano a Ventaglio e Controlli Azione (§9.2 riga 791) */}
        <footer className="board-hand-dock" data-testid="board-hand-dock">
          <div style={{ flex: 1, minWidth: 0 }}>{handSlot}</div>
          {actionControlsSlot !== undefined && (
            <div style={{ flexShrink: 0 }}>{actionControlsSlot}</div>
          )}
        </footer>
      </div>

      {/* Colonna Laterale / Cassetto Mobile per Controlli, Registro e Sotto-Mazzi (§9.2, §9.6) */}
      <aside
        className={`battlefield-board__sidebar ${
          mobileDrawerOpen ? 'battlefield-board__sidebar--drawer-open' : ''
        }`.trim()}
        data-testid="board-sidebar"
        aria-label="Registro di Battaglia e Mazzi"
      >
        {mobileDrawerOpen && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <strong className="font-display">Registro &amp; Mazzi</strong>
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

        {sidebarSlot ?? (
          <>
            <div className="board-zone" style={{ height: 'auto' }}>
              <header className="board-zone__header">
                <span className="board-zone__title">Sotto-mazzi e Scarti</span>
              </header>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  fontSize: '0.86rem',
                }}
              >
                <span>
                  Era {ERA_ROMAN_LABELS[1]}: {view.self.subdeckCounts[1]} carte
                </span>
                <span>
                  Era {ERA_ROMAN_LABELS[2]}: {view.self.subdeckCounts[2]} carte
                </span>
                <span>
                  Era {ERA_ROMAN_LABELS[3]}: {view.self.subdeckCounts[3]} carte
                </span>
                <span>Scarti personali: {view.self.discard.length}</span>
                <span>
                  Scarti pubblici avversario: {view.opponent.publicDiscard.length}
                </span>
              </div>
            </div>

            <div className="board-zone" style={{ flex: 1 }}>
              <header className="board-zone__header">
                <span className="board-zone__title">Registro di Battaglia</span>
                <span className="board-zone__count">
                  {battleLog.length} eventi
                </span>
              </header>
              <div
                className="board-zone__content"
                style={{ flexDirection: 'column', alignItems: 'stretch' }}
                data-testid="board-default-log-list"
              >
                {battleLog.length === 0 ? (
                  <div className="board-zone__empty">
                    Nessun evento registrato.
                  </div>
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
        )}
      </aside>

      {overlaySlot}

      {/* Modale globale di ispezione carta con tooltip parole chiave (§9.3, §9.6) */}
      <CardInspectModal
        cardId={inspectedCardId}
        onClose={() => setInspectedCardId(null)}
      />
    </main>
  );
}
