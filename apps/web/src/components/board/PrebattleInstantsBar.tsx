import { getCard, type CatalogCard } from '@epochs/content';
import {
  RESOURCE_KEYS,
  STORAGE_CAP_BY_ERA,
  ZERO_RESOURCES,
  addResources,
  canAfford,
  type CardInstance,
  type PlayerView,
  type Resource,
  type Resources,
} from '@epochs/engine';
import { useState, type ReactElement } from 'react';
import type { GameController } from '../../controllers/types.js';
import { useGameStore } from '../../state/game-store.js';
import { Card } from '../card/Card.js';
import { CardTypeIcon, RESOURCE_LABELS_IT, ResourceIcon, StatIcon } from '../icons/DomainIcons.js';

export interface SelectedInstantItem {
  readonly instance: CardInstance;
  readonly card: CatalogCard;
}

export interface PrebattleInstantsPreview {
  readonly selectedItems: readonly SelectedInstantItem[];
  readonly aggregateCost: Resources;
  readonly remainingResources: Resources;
  readonly canAffordSelection: boolean;
  readonly ownWallsDelta: number;
  readonly enemyWallsDelta: number;
  readonly projectedOwnWalls: number;
  readonly projectedEnemyWalls: number;
  readonly frontAtkBonus: number;
  readonly archersAtkBonus: number;
  readonly affectedFrontUnitsCount: number;
  readonly affectedArcherUnitsCount: number;
}

export interface PrebattleInstantsBarProps {
  readonly view?: PlayerView | null | undefined;
  readonly controller?: GameController | null | undefined;
  readonly selectedInstantUids?: readonly string[] | undefined;
  readonly onToggleInstantUid?: ((uid: string) => void) | undefined;
  readonly onClearSelectedInstants?: (() => void) | undefined;
  readonly onLockInstants?: ((cardUids: readonly string[]) => void) | undefined;
  readonly onInspectCard?: ((cardId: string) => void) | undefined;
}

/**
 * Calcola in tempo reale il costo aggregato, il saldo residuo e l'anteprima dei bonus
 * su Mura (con clamp finale a 0 secondo R3) e Unità per le Istantanee selezionate in `prebattle`
 * (§9.4 righe 818–820).
 */
export function calculatePrebattleInstantsPreview(
  view: PlayerView,
  selectedInstantUids: readonly string[],
): PrebattleInstantsPreview {
  const handByUid = new Map<string, CardInstance>();
  for (const item of view.self.hand) {
    handByUid.set(item.uid, item);
  }

  const selectedItems: SelectedInstantItem[] = [];
  let aggregateCost: Resources = { ...ZERO_RESOURCES };
  let ownWallsDelta = 0;
  let enemyWallsDelta = 0;
  let frontAtkBonus = 0;
  let archersAtkBonus = 0;

  for (const uid of selectedInstantUids) {
    const instance = handByUid.get(uid);
    if (!instance) {
      continue;
    }
    const card = getCard(instance.cardId);
    if (card.rules.type !== 'instant') {
      continue;
    }

    selectedItems.push({ instance, card });
    aggregateCost = addResources(aggregateCost, card.rules.cost);

    const effect = card.rules.effect;
    if (effect?.kind === 'walls_mod') {
      if (effect.target === 'own') {
        ownWallsDelta += effect.amount;
      } else {
        enemyWallsDelta += effect.amount;
      }
    } else if (effect?.kind === 'atk_mod') {
      if (effect.target === 'own_front') {
        frontAtkBonus += effect.amount;
      } else if (effect.target === 'own_archers') {
        archersAtkBonus += effect.amount;
      }
    }
  }

  const canAffordSelection = canAfford(view.self.resources, aggregateCost);
  const remainingResources: Resources = {
    food: view.self.resources.food - aggregateCost.food,
    wood: view.self.resources.wood - aggregateCost.wood,
    metal: view.self.resources.metal - aggregateCost.metal,
  };

  const projectedOwnWalls = Math.max(0, view.self.walls + ownWallsDelta);
  const projectedEnemyWalls = Math.max(0, view.opponent.walls + enemyWallsDelta);

  const affectedFrontUnitsCount = view.self.units.filter((u) => u.line === 'front').length;
  const affectedArcherUnitsCount = view.self.units.filter(
    (u) => getCard(u.cardId).rules.category === 'archer',
  ).length;

  return {
    selectedItems,
    aggregateCost,
    remainingResources,
    canAffordSelection,
    ownWallsDelta,
    enemyWallsDelta,
    projectedOwnWalls,
    projectedEnemyWalls,
    frontAtkBonus,
    archersAtkBonus,
    affectedFrontUnitsCount,
    affectedArcherUnitsCount,
  };
}

/**
 * Barra non bloccante per la selezione delle carte Istantanee in `prebattle` (§9.4 righe 818–820):
 * lascia completamente visibili ed esplorabili le 3 linee rivelate, mostra in tempo reale
 * costo aggregato, saldo residuo e anteprima bonus Mura/Unità prima di `"Blocca Scelte Pre-Battaglia"`.
 */
export function PrebattleInstantsBar({
  view: propView,
  controller,
  selectedInstantUids: propSelectedUids,
  onToggleInstantUid,
  onClearSelectedInstants,
  onLockInstants,
  onInspectCard,
}: PrebattleInstantsBarProps): ReactElement | null {
  const storeView = useGameStore((s) => s.presentationView ?? s.view);
  const storeSelectedUids = useGameStore((s) => s.selectedInstantUids);
  const isPlaying = useGameStore((s) => s.isPlaying);
  const isRevealingUnits = useGameStore((s) => s.isRevealingUnits);
  const toggleInstantUid = useGameStore((s) => s.toggleInstantUid);
  const setSelectedInstantUids = useGameStore((s) => s.setSelectedInstantUids);
  const setInspectedCardId = useGameStore((s) => s.setInspectedCardId);

  const [isMinimized, setIsMinimized] = useState(false);

  const view = propView !== undefined ? propView : storeView;
  if (view === null || view.phase !== 'prebattle') {
    return null;
  }

  const instantHandEntries: SelectedInstantItem[] = view.self.hand
    .map((instance) => ({
      instance,
      card: getCard(instance.cardId),
    }))
    .filter((entry) => entry.card.rules.type === 'instant');

  const validInstantUids = new Set(instantHandEntries.map((entry) => entry.instance.uid));
  const rawSelectedUids = propSelectedUids !== undefined ? propSelectedUids : storeSelectedUids;
  const selectedUids = rawSelectedUids.filter((uid) => validInstantUids.has(uid));

  const preview = calculatePrebattleInstantsPreview(view, selectedUids);
  const storageCap = STORAGE_CAP_BY_ERA[view.era];
  const canLock =
    !isPlaying &&
    view.self.legal.canLockInstants &&
    !view.self.committed &&
    preview.canAffordSelection;

  const handleToggleInstant = (instanceUid: string): void => {
    if (isPlaying || !view.self.legal.canLockInstants || view.self.committed) {
      return;
    }
    if (onToggleInstantUid) {
      onToggleInstantUid(instanceUid);
      return;
    }
    toggleInstantUid(instanceUid);
  };

  const handleClearSelection = (): void => {
    if (onClearSelectedInstants) {
      onClearSelectedInstants();
      return;
    }
    setSelectedInstantUids([]);
  };

  const handleLockInstants = (): void => {
    if (!canLock) {
      return;
    }
    const uidsToLock = [...selectedUids];
    setSelectedInstantUids([]);
    if (onLockInstants) {
      onLockInstants(uidsToLock);
      return;
    }
    controller?.dispatch({
      type: 'LockInstants',
      cardUids: uidsToLock,
    });
  };

  const handleInspect = (cardId: string): void => {
    if (onInspectCard) {
      onInspectCard(cardId);
      return;
    }
    setInspectedCardId(cardId);
  };

  return (
    <section
      role="region"
      aria-label="Finestra Pre-Battaglia: Selezione Istantanee"
      className="prebattle-instants-bar"
      data-testid="prebattle-instants-bar"
      data-non-blocking="true"
      data-selected-count={String(selectedUids.length)}
      data-revealing-units={isRevealingUnits ? 'true' : 'false'}
      style={{
        width: '100%',
        backgroundColor: 'rgba(20, 30, 39, 0.94)',
        border: '1.5px solid var(--brass, #B58E48)',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-card)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        color: 'var(--chalk, #E9E5D6)',
      }}
    >
      {/* Barra superiore: Titolo, stato rivelazione e pulsante riduci/espandi per esplorare le 3 linee */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CardTypeIcon type="instant" size={16} />
          <strong className="font-display" style={{ color: 'var(--brass)' }}>
            Finestra Pre-Battaglia — Istantanee Segrete (0 Slot)
          </strong>
          <span className="board-badge board-badge--brass">Selezionate: {selectedUids.length}</span>
          {isRevealingUnits && (
            <span className="board-badge" data-testid="prebattle-cascade-status">
              Rivelazione unità in corso...
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selectedUids.length > 0 && (
            <button
              type="button"
              className="touch-target"
              data-testid="prebattle-clear-instants-btn"
              onClick={handleClearSelection}
              style={{
                padding: '4px 10px',
                borderRadius: '5px',
                border: '1px solid rgba(233, 229, 214, 0.28)',
                backgroundColor: 'var(--surface-card, #223444)',
                color: 'var(--chalk, #E9E5D6)',
                fontFamily: 'var(--font-numeric)',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Azzera ({selectedUids.length})
            </button>
          )}

          <button
            type="button"
            className="touch-target"
            data-testid="prebattle-bar-collapse-toggle"
            aria-expanded={!isMinimized}
            onClick={() => setIsMinimized((prev) => !prev)}
            style={{
              padding: '4px 10px',
              borderRadius: '5px',
              border: '1px solid rgba(181, 142, 72, 0.4)',
              backgroundColor: 'var(--surface-card, #223444)',
              color: 'var(--chalk, #E9E5D6)',
              fontFamily: 'var(--font-numeric)',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isMinimized ? 'Mostra Istantanee' : 'Riduci (esplora linee)'}
          </button>
        </div>
      </header>

      {/* Riepilogo in tempo reale: Costo aggregato, Saldo residuo e Anteprima Bonus Mura/Unità */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '8px',
        }}
      >
        {/* 1. Costo aggregato e saldo residuo */}
        <div
          data-testid="prebattle-aggregate-cost"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            borderRadius: '6px',
            backgroundColor: 'var(--surface-card, #223444)',
            border: preview.canAffordSelection
              ? '1px solid rgba(233, 229, 214, 0.16)'
              : '1px solid var(--crimson, #A8404D)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.82rem',
              color: 'var(--chalk-muted)',
            }}
          >
            Costo totale &amp; Saldo:
          </span>

          {RESOURCE_KEYS.map((res: Resource) => {
            const cost = preview.aggregateCost[res];
            const remaining = preview.remainingResources[res];
            const isDeficit = remaining < 0;

            return (
              <span
                key={res}
                data-testid={`prebattle-cost-${res}`}
                data-cost={String(cost)}
                data-remaining={String(remaining)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  backgroundColor: isDeficit ? 'rgba(168, 64, 77, 0.28)' : 'rgba(20, 30, 39, 0.65)',
                  border: isDeficit
                    ? '1px solid var(--crimson, #A8404D)'
                    : '1px solid rgba(233, 229, 214, 0.14)',
                  fontFamily: 'var(--font-numeric)',
                  fontSize: '0.86rem',
                  fontWeight: 700,
                }}
              >
                <ResourceIcon resource={res} size={13} />
                <span>
                  {RESOURCE_LABELS_IT[res]} -{cost} ( Saldo: {remaining}/{storageCap})
                </span>
              </span>
            );
          })}
        </div>

        {/* 2. Anteprima Bonus su Mura e Unità */}
        <div
          data-testid="prebattle-bonus-preview"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            borderRadius: '6px',
            backgroundColor: 'var(--surface-card, #223444)',
            border: '1px solid rgba(181, 142, 72, 0.3)',
            fontFamily: 'var(--font-numeric)',
            fontSize: '0.86rem',
            fontWeight: 700,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.82rem',
              color: 'var(--chalk-muted)',
            }}
          >
            Anteprima Bonus:
          </span>

          <span
            className={`board-badge ${preview.ownWallsDelta !== 0 ? 'board-badge--brass' : ''}`}
            data-testid="prebattle-preview-own-walls"
            data-projected-walls={String(preview.projectedOwnWalls)}
          >
            <StatIcon stat="walls" size={13} />
            <span>
              Tue Mura: {view.self.walls} → {preview.projectedOwnWalls}
            </span>
          </span>

          <span
            className={`board-badge ${preview.enemyWallsDelta !== 0 ? 'board-badge--crimson' : ''}`}
            data-testid="prebattle-preview-enemy-walls"
            data-projected-walls={String(preview.projectedEnemyWalls)}
          >
            <StatIcon stat="walls" size={13} />
            <span>
              Mura Nemiche: {view.opponent.walls} → {preview.projectedEnemyWalls}
            </span>
          </span>

          <span
            className={`board-badge ${preview.frontAtkBonus > 0 ? 'board-badge--brass' : ''}`}
            data-testid="prebattle-preview-front-atk"
            data-bonus={String(preview.frontAtkBonus)}
          >
            <StatIcon stat="atk" size={13} />
            <span>
              Fronte: +{preview.frontAtkBonus} ATK ({preview.affectedFrontUnitsCount} unità)
            </span>
          </span>

          <span
            className={`board-badge ${preview.archersAtkBonus > 0 ? 'board-badge--brass' : ''}`}
            data-testid="prebattle-preview-archers-atk"
            data-bonus={String(preview.archersAtkBonus)}
          >
            <StatIcon stat="atk" size={13} />
            <span>
              Arcieri: +{preview.archersAtkBonus} ATK ({preview.affectedArcherUnitsCount} unità)
            </span>
          </span>
        </div>
      </div>

      {/* Elenco orizzontale compatto delle Istantanee in mano (non bloccante per le 3 linee) */}
      {!isMinimized && (
        <div data-testid="prebattle-instants-content">
          {view.self.committed ? (
            <div
              className="board-zone__empty"
              data-testid="prebattle-waiting-opponent"
              style={{ minHeight: '54px' }}
            >
              Scelte Pre-Battaglia bloccate — In attesa dell&apos;avversario...
            </div>
          ) : instantHandEntries.length === 0 ? (
            <div
              className="board-zone__empty"
              data-testid="prebattle-no-instants"
              style={{ minHeight: '48px' }}
            >
              Nessuna carta Istantanea nella tua mano — puoi esplorare le 3 linee rivelate e premere
              &ldquo;Blocca Scelte Pre-Battaglia&rdquo;.
            </div>
          ) : (
            <div
              role="list"
              aria-label="Carte Istantanee disponibili in mano"
              data-testid="prebattle-instants-list"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                overflowX: 'auto',
                padding: '4px 2px',
              }}
            >
              {instantHandEntries.map(({ instance, card }) => {
                const isSelected = selectedUids.includes(instance.uid);
                const costIfAdded = isSelected
                  ? preview.aggregateCost
                  : addResources(preview.aggregateCost, card.rules.cost);
                const isAffordable = canAfford(view.self.resources, costIfAdded);

                return (
                  <div
                    key={instance.uid}
                    role="listitem"
                    data-testid={`prebattle-instant-slot-${instance.uid}`}
                    data-selected={isSelected ? 'true' : 'false'}
                    data-affordable={isAffordable ? 'true' : 'false'}
                    style={{
                      width: '124px',
                      flexShrink: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <Card
                      card={card}
                      playable={isAffordable}
                      selected={isSelected}
                      unplayableReason={isAffordable ? undefined : 'insufficient_resources'}
                      onSelect={() => {
                        if (isSelected || isAffordable) {
                          handleToggleInstant(instance.uid);
                        }
                      }}
                      onInspect={handleInspect}
                    />
                    <button
                      type="button"
                      className="touch-target"
                      data-testid={`prebattle-instant-toggle-${instance.uid}`}
                      aria-pressed={isSelected}
                      disabled={!isSelected && !isAffordable}
                      onClick={() => handleToggleInstant(instance.uid)}
                      style={{
                        width: '100%',
                        padding: '4px 8px',
                        borderRadius: '5px',
                        border: isSelected
                          ? '1.5px solid var(--brass, #B58E48)'
                          : '1px solid rgba(233, 229, 214, 0.25)',
                        backgroundColor: isSelected
                          ? 'var(--brass, #B58E48)'
                          : 'var(--surface-card, #223444)',
                        color: isSelected
                          ? 'var(--table-deep, #141E27)'
                          : isAffordable
                            ? 'var(--chalk, #E9E5D6)'
                            : 'var(--chalk-muted, #A7B4C2)',
                        fontFamily: 'var(--font-numeric)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: isSelected || isAffordable ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {isSelected ? 'Selezionata' : isAffordable ? 'Seleziona' : 'Risorse insuff.'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Barra inferiore con il pulsante normativo "Blocca Scelte Pre-Battaglia" (§9.4 riga 820) */}
      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          borderTop: '1px solid rgba(181, 142, 72, 0.25)',
          paddingTop: '8px',
        }}
      >
        <span style={{ fontSize: '0.84rem', color: 'var(--chalk-muted)' }}>
          {!preview.canAffordSelection
            ? 'Il costo aggregato delle Istantanee selezionate supera le tue risorse.'
            : 'Le 3 linee del campo di battaglia restano esplorabili prima della conferma.'}
        </span>

        <button
          type="button"
          className="touch-target"
          data-testid="lock-instants-btn"
          disabled={!canLock}
          onClick={handleLockInstants}
          style={{
            padding: '8px 18px',
            borderRadius: '6px',
            border: '1.5px solid var(--brass, #B58E48)',
            backgroundColor: canLock ? 'var(--brass, #B58E48)' : 'var(--surface-card, #223444)',
            color: canLock ? 'var(--table-deep, #141E27)' : 'var(--chalk-muted, #A7B4C2)',
            fontFamily: 'var(--font-numeric)',
            fontSize: '0.98rem',
            fontWeight: 700,
            cursor: canLock ? 'pointer' : 'not-allowed',
            opacity: canLock ? 1 : 0.65,
          }}
        >
          Blocca Scelte Pre-Battaglia
        </button>
      </footer>
    </section>
  );
}
