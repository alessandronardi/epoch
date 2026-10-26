import { getCard, type CatalogCard } from '@epochs/content';
import {
  RESOURCE_KEYS,
  STORAGE_CAP_BY_ERA,
  ZERO_RESOURCES,
  creditResourcesWithCap,
  hasNonZeroResources,
  scaleResources,
  type CardInstance,
  type PlayerView,
  type Resource,
  type Resources,
} from '@epochs/engine';
import {
  useEffect,
  useState,
  type ReactElement,
} from 'react';
import type { GameController } from '../../controllers/types.js';
import { useGameStore } from '../../state/game-store.js';
import { Card } from '../card/Card.js';
import {
  RESOURCE_LABELS_IT,
  ResourceIcon,
  StatIcon,
} from '../icons/DomainIcons.js';

export interface ConversionGainPreview {
  readonly card: CatalogCard;
  readonly cap: number;
  readonly buildingCountPreSacrifice: number;
  readonly grossGain: Resources;
  readonly netGain: Resources;
  readonly finalResources: Resources;
  readonly overflow: Resources;
  readonly demBonusGained: number;
  readonly projectedTotalDemBonus: number;
}

export interface ConversionModalProps {
  readonly view?: PlayerView | null | undefined;
  readonly controller?: GameController | null | undefined;
  readonly activeConversionUid?: string | null | undefined;
  readonly initialSacrificeUid?: string | null | undefined;
  readonly onConfirmConversion?:
    | ((conversionUid: string, sacrificeUid: string) => void)
    | undefined;
  readonly onClose?: (() => void) | undefined;
  readonly onInspectCard?: ((cardId: string) => void) | undefined;
}

/**
 * Calcola l'anteprima esatta del guadagno lordo e del guadagno netto post-cap 16
 * per le Riconversioni di Era III (`e3_gld` Gilda dei Mercanti, `e3_frn` Altoforno Reale)
 * secondo GDD §3.3.6, R4, TV-18 e TECH-SPEC §9.4 riga 815.
 */
export function calculateConversionPreview(
  view: PlayerView,
  conversionCardId: string,
): ConversionGainPreview {
  const card = getCard(conversionCardId);
  const cap = STORAGE_CAP_BY_ERA[3]; // 16 in Era III
  const buildingCountPreSacrifice = view.self.buildings.length;

  const resourcesAfterCost: Resources = {
    food: Math.max(0, view.self.resources.food - card.rules.cost.food),
    wood: Math.max(0, view.self.resources.wood - card.rules.cost.wood),
    metal: Math.max(0, view.self.resources.metal - card.rules.cost.metal),
  };

  let grossGain: Resources = { ...ZERO_RESOURCES };
  let demBonusGained = 0;

  if (card.rules.effect?.kind === 'gain_per_building') {
    grossGain = scaleResources(
      card.rules.effect.perBuilding,
      buildingCountPreSacrifice,
    );
  } else if (card.rules.effect?.kind === 'gain_and_dem_bonus') {
    grossGain = { ...card.rules.effect.gain };
    demBonusGained = card.rules.effect.demBonus;
  }

  const creditResult = creditResourcesWithCap(resourcesAfterCost, grossGain, 3);

  return {
    card,
    cap,
    buildingCountPreSacrifice,
    grossGain,
    netGain: creditResult.delta,
    finalResources: creditResult.resources,
    overflow: creditResult.overflow,
    demBonusGained,
    projectedTotalDemBonus: view.self.demBonus + demBonusGained,
  };
}

export function ConversionModal({
  view: propView,
  controller,
  activeConversionUid: propActiveConversionUid,
  initialSacrificeUid,
  onConfirmConversion,
  onClose,
  onInspectCard,
}: ConversionModalProps): ReactElement | null {
  const storeView = useGameStore((s) => s.view);
  const storeActiveConversionUid = useGameStore((s) => s.activeConversionUid);
  const setActiveConversionUid = useGameStore((s) => s.setActiveConversionUid);
  const setSelectedHandUid = useGameStore((s) => s.setSelectedHandUid);
  const setInspectedCardId = useGameStore((s) => s.setInspectedCardId);

  const [selectedBuildingUid, setSelectedBuildingUid] = useState<string | null>(
    initialSacrificeUid ?? null,
  );

  const view = propView !== undefined ? propView : storeView;
  const activeConversionUid =
    propActiveConversionUid !== undefined
      ? propActiveConversionUid
      : storeActiveConversionUid;

  const conversionInstance: CardInstance | null =
    view !== null && activeConversionUid !== null
      ? view.self.hand.find((c) => c.uid === activeConversionUid) ?? null
      : null;

  useEffect(() => {
    if (view === null || conversionInstance === null) {
      return;
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setActiveConversionUid(null);
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [view, conversionInstance, setActiveConversionUid, onClose]);

  if (view === null || conversionInstance === null) {
    return null;
  }

  const sacrificableSet = new Set(view.self.legal.sacrificableBuildingUids);
  const availableBuildings =
    sacrificableSet.size > 0
      ? view.self.buildings.filter((b) => sacrificableSet.has(b.uid))
      : view.self.buildings;

  const effectiveSacrificeUid =
    selectedBuildingUid !== null &&
    availableBuildings.some((b) => b.uid === selectedBuildingUid)
      ? selectedBuildingUid
      : availableBuildings[0]?.uid ?? null;

  const selectedBuildingInstance =
    effectiveSacrificeUid !== null
      ? availableBuildings.find((b) => b.uid === effectiveSacrificeUid) ?? null
      : null;
  const selectedBuildingCard =
    selectedBuildingInstance !== null
      ? getCard(selectedBuildingInstance.cardId)
      : null;

  const preview = calculateConversionPreview(view, conversionInstance.cardId);
  const hasOverflow = hasNonZeroResources(preview.overflow);
  const canConfirm =
    effectiveSacrificeUid !== null &&
    view.phase === 'development' &&
    view.self.legal.canAct;

  const handleClose = (): void => {
    setActiveConversionUid(null);
    onClose?.();
  };

  const handleConfirm = (): void => {
    if (!canConfirm || effectiveSacrificeUid === null) {
      return;
    }
    const convUid = conversionInstance.uid;
    const sacUid = effectiveSacrificeUid;
    setActiveConversionUid(null);
    setSelectedHandUid(null);

    if (onConfirmConversion) {
      onConfirmConversion(convUid, sacUid);
      return;
    }

    controller?.dispatch({
      type: 'PlayConversion',
      cardUid: convUid,
      sacrificeUid: sacUid,
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
    <div
      className="epochs-inspect-backdrop"
      data-testid="conversion-modal-backdrop"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversion-modal-title"
        data-testid="conversion-modal"
        data-conversion-card-id={conversionInstance.cardId}
        data-selected-building-uid={effectiveSacrificeUid ?? ''}
        onClick={(ev) => ev.stopPropagation()}
        style={{
          width: 'min(880px, 96vw)',
          maxHeight: '92dvh',
          backgroundColor: 'var(--table, #1C2B38)',
          border: '2px solid var(--brass, #B58E48)',
          borderRadius: '14px',
          boxShadow: 'var(--shadow-modal)',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          overflowY: 'auto',
          color: 'var(--chalk, #E9E5D6)',
        }}
      >
        {/* Header della modale di Riconversione */}
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            borderBottom: '1px solid var(--brass-subtle)',
            paddingBottom: '10px',
          }}
        >
          <div>
            <h2
              id="conversion-modal-title"
              className="font-display"
              style={{ margin: '0 0 4px 0', fontSize: '1.3rem', color: 'var(--brass)' }}
            >
              Riconversione: {preview.card.text.name}
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: '0.92rem',
                color: 'var(--chalk-muted)',
              }}
            >
              {preview.card.rulesText} Seleziona quale tuo Edificio Economico
              attivo sacrificare.
            </p>
          </div>

          <span className="board-badge board-badge--brass">
            0 Slot · Cap Magazzino {preview.cap}
          </span>
        </header>

        {/* Box Anteprima Guadagno Netto Post-Cap 16 (§9.4 riga 815) */}
        <section
          aria-label="Anteprima del guadagno netto post-cap 16"
          data-testid="conversion-net-gain-preview"
          style={{
            padding: '12px 14px',
            borderRadius: '8px',
            backgroundColor: 'var(--surface-card, #223444)',
            border: '1px solid var(--brass, #B58E48)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <strong className="font-display" style={{ color: 'var(--brass)' }}>
              Anteprima Guadagno Netto (Cap Magazzino {preview.cap})
            </strong>
            <span style={{ fontSize: '0.84rem', color: 'var(--chalk-muted)' }}>
              Edifici attivi pre-sacrificio: {preview.buildingCountPreSacrifice}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '8px',
            }}
          >
            {RESOURCE_KEYS.map((res: Resource) => {
              const gross = preview.grossGain[res];
              const net = preview.netGain[res];
              const before = view.self.resources[res];
              const after = preview.finalResources[res];
              const lost = preview.overflow[res];

              return (
                <div
                  key={res}
                  data-testid={`conversion-net-${res}`}
                  data-gross-gain={String(gross)}
                  data-net-gain={String(net)}
                  data-final-amount={String(after)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(20, 30, 39, 0.65)',
                    border: '1px solid rgba(233, 229, 214, 0.14)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontFamily: 'var(--font-numeric)',
                      fontWeight: 700,
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <ResourceIcon resource={res} size={14} />
                      <span>{RESOURCE_LABELS_IT[res]}</span>
                    </span>
                    <span
                      style={{
                        color:
                          net > 0
                            ? 'var(--brass, #B58E48)'
                            : 'var(--chalk-muted)',
                      }}
                    >
                      Netto: +{net} (Lordo: +{gross})
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--chalk-muted)',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>
                      Saldo: {before} → {after}/{preview.cap}
                    </span>
                    {lost > 0 && (
                      <span
                        style={{ color: 'var(--crimson, #A8404D)' }}
                        data-testid={`conversion-overflow-${res}`}
                      >
                        Troncato: -{lost}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {preview.demBonusGained > 0 && (
            <div
              data-testid="conversion-dem-bonus-preview"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: '6px',
                backgroundColor: 'rgba(181, 142, 72, 0.18)',
                border: '1px solid var(--brass, #B58E48)',
                fontFamily: 'var(--font-numeric)',
                fontWeight: 700,
              }}
            >
              <StatIcon stat="dem" size={15} />
              <span>
                Bonus Demolizione permanente Era III: +{preview.demBonusGained}{' '}
                DEM a ogni tua unità (Totale: +{preview.projectedTotalDemBonus}{' '}
                DEM)
              </span>
            </div>
          )}

          {hasOverflow && (
            <p
              data-testid="conversion-cap-warning"
              style={{
                margin: 0,
                fontSize: '0.82rem',
                color: 'var(--crimson, #A8404D)',
              }}
            >
              Attenzione: parte del guadagno eccede il cap di magazzino ({preview.cap})
              e verrà troncata.
            </p>
          )}
        </section>

        {/* Selettore degli Edifici Economici attivi da sacrificare */}
        <section aria-label="Seleziona l'Edificio Economico da sacrificare">
          <h3
            className="font-display"
            style={{ margin: '0 0 8px 0', fontSize: '1rem' }}
          >
            Edifici Economici attivi nella tua Città ({availableBuildings.length})
          </h3>

          {availableBuildings.length === 0 ? (
            <div className="board-zone__empty">
              Nessun Edificio Economico attivo disponibile per il sacrificio.
            </div>
          ) : (
            <div
              role="list"
              data-testid="conversion-buildings-list"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '12px',
                justifyItems: 'center',
              }}
            >
              {availableBuildings.map((building) => {
                const isSelected = building.uid === effectiveSacrificeUid;
                const bCard = getCard(building.cardId);

                return (
                  <div
                    key={building.uid}
                    role="listitem"
                    data-testid={`conversion-building-slot-${building.uid}`}
                    data-selected={isSelected ? 'true' : 'false'}
                    style={{
                      width: '100%',
                      maxWidth: '165px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Card
                      card={bCard}
                      selected={isSelected}
                      playable={!isSelected}
                      onSelect={() => setSelectedBuildingUid(building.uid)}
                      onInspect={handleInspect}
                    />
                    <button
                      type="button"
                      className="touch-target"
                      data-testid={`conversion-select-building-${building.uid}`}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedBuildingUid(building.uid)}
                      style={{
                        width: '100%',
                        padding: '5px 8px',
                        borderRadius: '5px',
                        border: isSelected
                          ? '1.5px solid var(--brass, #B58E48)'
                          : '1px solid rgba(233, 229, 214, 0.24)',
                        backgroundColor: isSelected
                          ? 'var(--brass, #B58E48)'
                          : 'var(--surface-card, #223444)',
                        color: isSelected
                          ? 'var(--table-deep, #141E27)'
                          : 'var(--chalk, #E9E5D6)',
                        fontFamily: 'var(--font-numeric)',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {isSelected ? 'Sacrificio selezionato' : 'Seleziona edificio'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Footer conferma o annullamento */}
        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            borderTop: '1px solid var(--brass-subtle)',
            paddingTop: '12px',
          }}
        >
          <span style={{ fontSize: '0.86rem', color: 'var(--chalk-muted)' }}>
            {selectedBuildingCard !== null
              ? `Edificio da sacrificare: ${selectedBuildingCard.text.name} (${selectedBuildingCard.rulesText})`
              : 'Seleziona un Edificio Economico da sacrificare'}
          </span>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="touch-target"
              data-testid="cancel-conversion-btn"
              onClick={handleClose}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid rgba(233, 229, 214, 0.3)',
                backgroundColor: 'var(--surface-card, #223444)',
                color: 'var(--chalk, #E9E5D6)',
                fontFamily: 'var(--font-numeric)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Annulla
            </button>

            <button
              type="button"
              className="touch-target"
              data-testid="confirm-conversion-btn"
              disabled={!canConfirm}
              onClick={handleConfirm}
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                border: '1.5px solid var(--brass, #B58E48)',
                backgroundColor: canConfirm
                  ? 'var(--brass, #B58E48)'
                  : 'var(--surface-card, #223444)',
                color: canConfirm
                  ? 'var(--table-deep, #141E27)'
                  : 'var(--chalk-muted, #A7B4C2)',
                fontFamily: 'var(--font-numeric)',
                fontSize: '0.96rem',
                fontWeight: 700,
                cursor: canConfirm ? 'pointer' : 'not-allowed',
              }}
            >
              Conferma Riconversione
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
