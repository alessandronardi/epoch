import { useDndContext, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { getCard, type CatalogCard } from '@epochs/content';
import {
  LOGISTICS_CAP_BY_ERA,
  effectiveCardCost,
  RESOURCE_KEYS,
  type CardInstance,
  type PlayerView,
  type Resource,
  type UnplayableReason,
} from '@epochs/engine';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import {
  formatUnplayableReasonIt,
  useGameStore,
  type UnplayableBannerState,
} from '../../state/game-store.js';
import { Card } from '../card/Card.js';
import { RESOURCE_LABELS_IT } from '../icons/DomainIcons.js';

export interface DraggedHandCardData {
  readonly uid: string;
  readonly cardId: string;
  readonly cardType: CatalogCard['rules']['type'];
  readonly playable: boolean;
  readonly unplayableReason?: UnplayableReason | undefined;
}

export interface PlayerHandProps {
  readonly view?: PlayerView | null | undefined;
  readonly selectedHandUid?: string | null | undefined;
  readonly selectedInstantUids?: readonly string[] | undefined;
  readonly unplayableBanner?: UnplayableBannerState | null | undefined;
  readonly enableDrag?: boolean | undefined;
  readonly suggestedCardIds?: readonly string[] | undefined;
  readonly onSelectCard?: ((instance: CardInstance, playable: boolean) => void) | undefined;
  readonly onPlayCard?: ((cardUid: string) => void) | undefined;
  readonly onInspectCard?: ((cardId: string) => void) | undefined;
  readonly onDismissBanner?: (() => void) | undefined;
}

/**
 * Costruisce un messaggio esplicativo in italiano per una carta non giocabile (§9.4 riga 812),
 * includendo il dettaglio specifico della risorsa mancante, del Cap Logistico o della fase.
 */
export function buildUnplayableBannerMessage(
  card: CatalogCard,
  reason: UnplayableReason,
  view?: PlayerView | null,
): string {
  switch (reason) {
    case 'no_slot': {
      const era = view?.era ?? 1;
      const cap = LOGISTICS_CAP_BY_ERA[era];
      const used = view?.self.slotsUsed ?? cap;
      return `Cap Logistico raggiunto (${used}/${cap})`;
    }
    case 'insufficient_resources': {
      if (view !== undefined && view !== null) {
        const cost = effectiveCardCost(card.rules, view.self, view.rulesetVersion);
        const missingResources: Resource[] = RESOURCE_KEYS.filter(
          (res) => cost[res] > view.self.resources[res],
        );
        if (missingResources.length === 1) {
          const singleRes = missingResources[0]!;
          return `${RESOURCE_LABELS_IT[singleRes]} insufficiente (${view.self.resources[singleRes]}/${cost[singleRes]}) — Risorse insufficienti`;
        }
        if (missingResources.length > 1) {
          const labels = missingResources
            .map((res) => `${RESOURCE_LABELS_IT[res]} insufficiente`)
            .join(', ');
          return `${labels} — Risorse insufficienti`;
        }
      }
      return formatUnplayableReasonIt(reason, view);
    }
    case 'no_building_to_sacrifice':
      return 'Richiede almeno un Edificio Economico attivo da sacrificare';
    case 'wrong_phase': {
      if (card.rules.type === 'instant') {
        return 'Giocabile solo in Pre-Battaglia';
      }
      if (card.rules.type === 'conversion') {
        return "Giocabile solo nella Fase di Sviluppo dell'Era III";
      }
      return formatUnplayableReasonIt(reason, view);
    }
    case 'already_passed':
      return formatUnplayableReasonIt(reason, view);
    case 'already_committed':
      return formatUnplayableReasonIt(reason, view);
  }
}

interface DraggableHandSlotProps {
  readonly instance: CardInstance;
  readonly catalogCard: CatalogCard;
  readonly index: number;
  readonly total: number;
  readonly playable: boolean;
  readonly selected: boolean;
  readonly unplayableReason: UnplayableReason | undefined;
  readonly enableDrag: boolean;
  readonly suggested: boolean;
  readonly slotRef: (el: HTMLDivElement | null) => void;
  readonly onActivate: () => void;
  readonly onPlay: (() => void) | undefined;
  readonly onInspect: (cardId: string) => void;
  readonly onKeyNavigate: (event: KeyboardEvent<HTMLDivElement>, index: number) => void;
}

function DraggableHandSlot({
  instance,
  catalogCard,
  index,
  total,
  playable,
  selected,
  unplayableReason,
  enableDrag,
  suggested,
  slotRef,
  onActivate,
  onPlay,
  onInspect,
  onKeyNavigate,
}: DraggableHandSlotProps): ReactElement {
  const dragData: DraggedHandCardData = {
    uid: instance.uid,
    cardId: instance.cardId,
    cardType: catalogCard.rules.type,
    playable,
    unplayableReason,
  };

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `hand-card-${instance.uid}`,
    data: dragData,
    disabled: !enableDrag || !playable,
  });

  const { role: _draggableRole, tabIndex: _draggableTabIndex, ...ariaDragAttributes } = attributes;

  // Calcolo angolo e arco per la disposizione a ventaglio (fino a 10 carte, §9.2 riga 791)
  const centerIndex = (total - 1) / 2;
  const offsetFromCenter = index - centerIndex;
  const fanAngleDeg = total > 1 ? offsetFromCenter * 2.2 : 0;
  const archLiftPx = total > 1 ? Math.abs(offsetFromCenter) * 3.5 : 0;

  const dragTransform = transform ? CSS.Translate.toString(transform) : undefined;
  const fanTransform = selected
    ? 'translateY(-18px) scale(1.07)'
    : `translateY(${archLiftPx.toFixed(1)}px) rotate(${fanAngleDeg.toFixed(2)}deg)`;

  const combinedStyle: CSSProperties = {
    transform: dragTransform ?? fanTransform,
    zIndex: isDragging ? 45 : selected ? 30 : index + 1,
    opacity: isDragging ? 0.55 : 1,
    width: 'clamp(128px, 12vw, 184px)',
    minWidth: 'var(--touch-target-min, 44px)',
    minHeight: 'var(--touch-target-min, 44px)',
    marginLeft: index === 0 ? '0px' : 'clamp(-18px, -1.2vw, -6px)',
    transition: isDragging
      ? 'none'
      : 'transform var(--motion-fast, 120ms) ease, box-shadow var(--motion-fast, 120ms) ease',
    position: 'relative',
    flexShrink: 0,
    touchAction: playable && enableDrag ? 'none' : 'manipulation',
  };

  const setCombinedRef = (node: HTMLDivElement | null): void => {
    setNodeRef(node);
    slotRef(node);
  };

  return (
    <div
      ref={setCombinedRef}
      className={`player-hand__slot touch-target ${
        playable ? 'player-hand__slot--playable' : 'player-hand__slot--unplayable'
      } ${selected ? 'player-hand__slot--selected' : ''} ${suggested ? 'player-hand__slot--suggested' : ''}`.trim()}
      style={combinedStyle}
      data-testid={`hand-slot-${instance.uid}`}
      data-hand-uid={instance.uid}
      data-hand-card-id={instance.cardId}
      data-hand-index={String(index)}
      data-playable={playable ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      data-unplayable-reason={unplayableReason}
      role="listitem"
      {...(enableDrag && playable ? { ...listeners, ...ariaDragAttributes } : {})}
      onKeyDown={(ev) => {
        onKeyNavigate(ev, index);
        if (!ev.defaultPrevented && enableDrag && playable) listeners?.['onKeyDown']?.(ev);
      }}
    >
      <Card
        card={catalogCard}
        playable={playable}
        selected={selected}
        unplayableReason={unplayableReason}
        onSelect={() => onActivate()}
        onDoubleActivate={onPlay}
        onInspect={onInspect}
      />
    </div>
  );
}

export function PlayerHand({
  view: propView,
  selectedHandUid: propSelectedHandUid,
  selectedInstantUids: propSelectedInstantUids,
  unplayableBanner: propUnplayableBanner,
  enableDrag = true,
  suggestedCardIds = [],
  onSelectCard,
  onPlayCard,
  onInspectCard,
  onDismissBanner,
}: PlayerHandProps): ReactElement {
  const storeView = useGameStore((s) => s.presentationView ?? s.view);
  const storeSelectedHandUid = useGameStore((s) => s.selectedHandUid);
  const storeSelectedInstantUids = useGameStore((s) => s.selectedInstantUids);
  const storeUnplayableBanner = useGameStore((s) => s.unplayableBanner);
  const setSelectedHandUid = useGameStore((s) => s.setSelectedHandUid);
  const setUnplayableBanner = useGameStore((s) => s.setUnplayableBanner);
  const setInspectedCardId = useGameStore((s) => s.setInspectedCardId);
  const toggleInstantUid = useGameStore((s) => s.toggleInstantUid);

  const [handOpen, setHandOpen] = useState(false);
  const { active } = useDndContext();
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);

  const view = propView !== undefined ? propView : storeView;
  const selectedHandUid =
    propSelectedHandUid !== undefined ? propSelectedHandUid : storeSelectedHandUid;
  const selectedInstantUids =
    propSelectedInstantUids !== undefined ? propSelectedInstantUids : storeSelectedInstantUids;
  const unplayableBanner =
    propUnplayableBanner !== undefined ? propUnplayableBanner : storeUnplayableBanner;

  useEffect(() => {
    setHandOpen(false);
  }, [view?.phase, view?.me, view?.self.hand.length]);

  const handleInspect = (cardId: string): void => {
    if (onInspectCard) {
      onInspectCard(cardId);
      return;
    }
    setInspectedCardId(cardId);
  };

  const handleDismissBanner = (): void => {
    setUnplayableBanner(null);
    onDismissBanner?.();
  };

  if (view === null) {
    return (
      <section
        className="player-hand player-hand--empty"
        data-testid="player-hand-empty"
        aria-label="La tua mano"
      >
        <div className="board-zone__empty">Mano non disponibile</div>
      </section>
    );
  }

  const hand = view.self.hand;
  const handPlayability = view.self.legal.handPlayability;

  const resolveCardPlayability = (
    instance: CardInstance,
    catalogCard: CatalogCard,
  ): { playable: boolean; reason: UnplayableReason | undefined } => {
    const entry = handPlayability[instance.uid];
    if (entry !== undefined) {
      return {
        playable: entry.playable,
        reason: entry.playable ? undefined : entry.reason,
      };
    }

    if (view.phase === 'prebattle') {
      const canPlayInstant =
        view.self.legal.canLockInstants &&
        view.self.legal.playableInstantUids.includes(instance.uid);
      if (canPlayInstant) {
        return { playable: true, reason: undefined };
      }
      return {
        playable: false,
        reason: catalogCard.rules.type === 'instant' ? 'insufficient_resources' : 'wrong_phase',
      };
    }

    return { playable: false, reason: 'wrong_phase' };
  };

  const handleActivateCard = (instance: CardInstance, catalogCard: CatalogCard): void => {
    const { playable, reason } = resolveCardPlayability(instance, catalogCard);

    if (!playable) {
      const effectiveReason: UnplayableReason = reason ?? 'wrong_phase';
      const message = buildUnplayableBannerMessage(catalogCard, effectiveReason, view);
      setSelectedHandUid(null);
      setUnplayableBanner({
        uid: instance.uid,
        cardId: instance.cardId,
        reason: effectiveReason,
        message,
      });
      onSelectCard?.(instance, false);
      return;
    }

    setUnplayableBanner(null);

    if (view.phase === 'prebattle' && catalogCard.rules.type === 'instant') {
      toggleInstantUid(instance.uid);
      onSelectCard?.(instance, true);
      return;
    }

    const nextSelectedUid = selectedHandUid === instance.uid ? null : instance.uid;
    setSelectedHandUid(nextSelectedUid);
    onSelectCard?.(instance, true);
  };

  const focusHandSlotAt = (targetIndex: number): void => {
    if (hand.length === 0) {
      return;
    }
    const clampedIndex = (targetIndex + hand.length) % hand.length;
    const slotEl = slotRefs.current[clampedIndex];
    if (slotEl) {
      const focusableCard = slotEl.querySelector<HTMLElement>('[tabindex="0"]') ?? slotEl;
      focusableCard.focus();
    }
  };

  const handleSlotKeyNavigation = (event: KeyboardEvent<HTMLDivElement>, index: number): void => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      focusHandSlotAt(index + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusHandSlotAt(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusHandSlotAt(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusHandSlotAt(hand.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setSelectedHandUid(null);
      setUnplayableBanner(null);
    }
  };

  const selectedInstance =
    selectedHandUid !== null ? (hand.find((c) => c.uid === selectedHandUid) ?? null) : null;
  const selectedCatalogCard =
    selectedInstance !== null ? getCard(selectedInstance.cardId, view.catalogVersion) : null;
  const selectedCost = selectedCatalogCard
    ? effectiveCardCost(selectedCatalogCard.rules, view.self, view.rulesetVersion ?? '1.0')
    : null;

  return (
    <section
      className={`player-hand ${view.phase === 'development' ? 'player-hand--retractable' : ''}`}
      data-expanded={handOpen || active !== null}
      tabIndex={-1}
      onPointerDown={(event) => {
        if (event.pointerType === 'touch' || event.pointerType === 'pen') setHandOpen(true);
      }}
      onFocus={() => setHandOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHandOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setHandOpen(false);
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHandOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setHandOpen(false);
      }}
      data-testid="player-hand"
      data-hand-count={String(hand.length)}
      aria-label={`La tua mano (${hand.length} su 10 carte)`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        position: 'relative',
        width: '100%',
      }}
    >
      {/* Banner di avviso quando viene toccata una carta non giocabile (§9.4 riga 812) */}
      {unplayableBanner !== null && (
        <div
          role="status"
          aria-live="polite"
          className="player-hand__unplayable-banner"
          data-testid="unplayable-reason-banner"
          data-reason={unplayableBanner.reason}
          data-card-id={unplayableBanner.cardId}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            padding: '6px 12px',
            borderRadius: '6px',
            backgroundColor: 'rgba(168, 64, 77, 0.24)',
            border: '1px solid var(--crimson, #A8404D)',
            color: 'var(--chalk, #E9E5D6)',
            fontSize: '0.88rem',
          }}
        >
          <div>
            <strong className="font-display" style={{ marginRight: '6px' }}>
              {getCard(unplayableBanner.cardId, view.catalogVersion).text.name}:
            </strong>
            <span data-testid="unplayable-reason-text">{unplayableBanner.message}</span>
          </div>
          <button
            type="button"
            className="touch-target"
            data-testid="unplayable-banner-dismiss"
            aria-label="Chiudi avviso di carta non giocabile"
            onClick={handleDismissBanner}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              border: '1px solid rgba(233, 229, 214, 0.3)',
              backgroundColor: 'var(--surface-card, #223444)',
              color: 'var(--chalk, #E9E5D6)',
              fontFamily: 'var(--font-numeric)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Chiudi
          </button>
        </div>
      )}

      {/* Anteprima rapida della carta selezionata (Tap-to-Play, §9.4 riga 814) */}
      {selectedInstance !== null && selectedCatalogCard !== null && (
        <div
          className="player-hand__selected-preview"
          data-testid="hand-selected-preview"
          data-selected-uid={selectedInstance.uid}
          data-selected-card-id={selectedInstance.cardId}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            padding: '5px 10px',
            borderRadius: '6px',
            backgroundColor: 'rgba(181, 142, 72, 0.16)',
            border: '1px solid var(--brass, #B58E48)',
            fontSize: '0.86rem',
          }}
        >
          <div>
            <strong className="font-display">{selectedCatalogCard.text.name}</strong>
            <span style={{ margin: '0 6px', color: 'var(--chalk-muted)' }}>·</span>
            <span>{selectedCatalogCard.text.typeLine}</span>
            <span style={{ margin: '0 6px', color: 'var(--chalk-muted)' }}>—</span>
            <span>{selectedCatalogCard.rulesText}</span>
            {selectedCost &&
              view.rulesetVersion === '2.0' &&
              selectedCatalogCard.rules.type === 'unit' && (
                <p data-testid="hand-effective-cost" style={{ margin: '4px 0 0' }}>
                  Costo attuale: {selectedCost.food} Cibo, {selectedCost.wood} Legno,{' '}
                  {selectedCost.metal} Metallo. Il costo stampato resta sulla carta.
                </p>
              )}
          </div>

          {onPlayCard !== undefined && (
            <button
              type="button"
              className="touch-target"
              data-testid="hand-preview-play-btn"
              onClick={() => onPlayCard(selectedInstance.uid)}
              style={{
                padding: '4px 12px',
                borderRadius: '5px',
                border: '1px solid var(--brass, #B58E48)',
                backgroundColor: 'var(--brass, #B58E48)',
                color: 'var(--table-deep, #141E27)',
                fontFamily: 'var(--font-numeric)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Gioca Carta
            </button>
          )}
        </div>
      )}

      {/* Ventaglio delle carte in mano (fino a 10 carte, navigabile con Frecce/Tab/Invio) */}
      {view.rulesetVersion === '2.0' &&
        view.self.civilizationId === 'feudal' &&
        !view.self.organizationUsed && (
          <small role="status">
            Organizzazione disponibile: −1 Cibo alla prima Unità (minimo 0).
          </small>
        )}
      {hand.length === 0 ? (
        <div
          className="board-zone__empty"
          data-testid="player-hand-no-cards"
          style={{ minHeight: '56px' }}
        >
          Nessuna carta in mano
        </div>
      ) : (
        <div
          role="list"
          aria-label="Carte nella tua mano"
          className="player-hand__fan"
          data-testid="player-hand-fan"
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'safe center',
            padding: '28px 12px 22px',
            overflowX: 'auto',
            overflowY: 'hidden',
            minHeight: '142px',
          }}
        >
          {hand.map((instance, idx) => {
            const catalogCard = getCard(instance.cardId, view.catalogVersion);
            const { playable, reason } = resolveCardPlayability(instance, catalogCard);
            const isSelected =
              view.phase === 'prebattle'
                ? selectedInstantUids.includes(instance.uid)
                : selectedHandUid === instance.uid;

            return (
              <DraggableHandSlot
                key={instance.uid}
                instance={instance}
                catalogCard={catalogCard}
                index={idx}
                total={hand.length}
                playable={playable}
                selected={isSelected}
                unplayableReason={reason}
                enableDrag={enableDrag && view.phase === 'development'}
                suggested={suggestedCardIds.includes(instance.cardId)}
                slotRef={(el) => {
                  slotRefs.current[idx] = el;
                }}
                onActivate={() => handleActivateCard(instance, catalogCard)}
                onPlay={
                  view.phase === 'development' && enableDrag
                    ? () => onPlayCard?.(instance.uid)
                    : undefined
                }
                onInspect={handleInspect}
                onKeyNavigate={handleSlotKeyNavigation}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
