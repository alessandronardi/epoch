import { useCatalogVersion } from '../../content/use-catalog-version.js';
import type { ContentVersion } from '@epochs/content';
import { useBoardCardInspection } from './BoardCardInspection.js';
import { getCard, CIVILIZATIONS, type CatalogCard } from '@epochs/content';
import type { Resource, UnplayableReason } from '@epochs/engine';
import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  CardTypeIcon,
  ERA_LABELS_IT,
  ERA_ROMAN_LABELS,
  EraIcon,
  LineIcon,
  RESOURCE_LABELS_IT,
  ResourceIcon,
  STAT_LABELS_IT,
  StatIcon,
  UnitCategoryIcon,
} from '../icons/DomainIcons.js';
import { CardArtPicture, getCardPlaceholderUrl } from './CardArtPicture.js';
import './card.css';

export { CardArtPicture, getCardPlaceholderUrl };

export const LONG_PRESS_MS = 250;

const RESOURCE_ORDER: readonly Resource[] = ['food', 'wood', 'metal'];

export interface CardProps {
  readonly version?: ContentVersion | undefined;
  readonly cardId?: string | undefined;
  readonly card?: CatalogCard | undefined;
  readonly atkMod?: number | undefined;
  readonly demBonus?: number | undefined;
  readonly currentHp?: number | undefined;
  readonly playable?: boolean | undefined;
  readonly selected?: boolean | undefined;
  readonly unplayableReason?: UnplayableReason | undefined;
  readonly coveredForOpponent?: boolean | undefined;
  readonly onSelect?: ((cardId: string) => void) | undefined;
  readonly onDoubleActivate?: (() => void) | undefined;
  readonly onInspect?: ((cardId: string) => void) | undefined;
  readonly artSlot?: ReactNode | undefined;
  readonly className?: string | undefined;
}

export function resolveCatalogCard(
  cardId: string | undefined,
  card: CatalogCard | undefined,
  version: ContentVersion = '1.0',
): CatalogCard {
  if (card !== undefined) {
    return card;
  }
  if (cardId !== undefined) {
    return getCard(cardId, version);
  }
  throw new Error('Card component requires either card or cardId prop.');
}

export function Card({
  version,
  cardId,
  card,
  atkMod = 0,
  demBonus = 0,
  currentHp,
  playable = false,
  selected = false,
  unplayableReason,
  coveredForOpponent = false,
  onSelect,
  onInspect,
  onDoubleActivate,
  artSlot,
  className,
}: CardProps): ReactElement {
  const catalogVersion = useCatalogVersion(version);
  const resolved = resolveCatalogCard(cardId, card, catalogVersion);
  const { rules, text, rulesText } = resolved;

  const inspection = useBoardCardInspection(
    { cardId: resolved.id, atkMod, demBonus, currentHp },
    onInspect,
  );
  const inspect = inspection?.inspect ?? onInspect;

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPress = (): void => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const handlePointerDown = (): void => {
    longPressTriggeredRef.current = false;
    if (!inspect) {
      return;
    }
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      inspect(resolved.id);
    }, LONG_PRESS_MS);
  };

  const handlePointerUpOrLeave = (): void => {
    clearLongPress();
  };

  const handleClick = (event: MouseEvent<HTMLElement>): void => {
    if (longPressTriggeredRef.current) {
      event.preventDefault();
      longPressTriggeredRef.current = false;
      return;
    }
    onSelect?.(resolved.id);
  };

  const handleDoubleClick = (event: MouseEvent<HTMLElement>): void => {
    event.stopPropagation();
    clearLongPress();
    if (onDoubleActivate) onDoubleActivate();
    else inspect?.(resolved.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(resolved.id);
    } else if ((event.key === 'i' || event.key === 'I' || event.key === 'ContextMenu') && inspect) {
      event.preventDefault();
      inspect(resolved.id);
    }
  };

  const positiveCosts = RESOURCE_ORDER.filter((res) => rules.cost[res] > 0);

  const baseAtk = rules.atk ?? 0;
  const effectiveAtk = baseAtk + atkMod;
  const isAtkBuffed = atkMod > 0;

  const baseDem = rules.dem ?? 0;
  const effectiveDem = baseDem + demBonus;
  const isDemBuffed = demBonus > 0;

  const maxHp = rules.hp ?? 0;
  const effectiveHp = currentHp ?? maxHp;
  const isHpDamaged = currentHp !== undefined && currentHp < maxHp;

  const rootClasses = [
    'epochs-card',
    playable ? 'epochs-card--playable' : '',
    selected ? 'epochs-card--selected' : '',
    unplayableReason !== undefined ? 'epochs-card--unplayable' : '',
    className ?? '',
  ]
    .filter((c) => c.length > 0)
    .join(' ');

  return (
    <div className="epochs-card-wrapper" data-card-wrapper={resolved.id}>
      <article
        ref={inspection?.ref}
        className={rootClasses}
        data-testid={`card-${resolved.id}`}
        data-card-id={resolved.id}
        data-card-type={rules.type}
        data-era={String(rules.era)}
        data-playable={playable ? 'true' : 'false'}
        data-selected={selected ? 'true' : 'false'}
        data-unplayable-reason={unplayableReason}
        tabIndex={0}
        aria-label={`${text.name} — ${text.typeLine} (${ERA_LABELS_IT[rules.era]})`}
        onPointerEnter={inspection?.onPointerEnter}
        onFocus={inspection?.onFocus}
        onBlur={inspection?.onBlur}
        onPointerDown={(event) => {
          inspection?.onPointerDown(event);
          handlePointerDown();
        }}
        onPointerUp={handlePointerUpOrLeave}
        onPointerLeave={(event) => {
          handlePointerUpOrLeave();
          inspection?.onPointerLeave(event);
        }}
        onPointerCancel={handlePointerUpOrLeave}
        onPointerMove={clearLongPress}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
      >
        {/* 1. Header (9fr): Nome carta a sinistra; pip dei costi > 0 a destra */}
        <header className="epochs-card__header" data-card-band="header">
          <span className="epochs-card__name" title={text.name}>
            {text.name}
            {rules.affiliation && rules.affiliation !== 'common' && (
              <small title={CIVILIZATIONS[rules.affiliation].name}>
                {' '}
                · {rules.affiliation === 'feudal' ? '♜' : rules.affiliation === 'norse' ? 'ᚾ' : '✦'}
              </small>
            )}
          </span>
          <div className="epochs-card__costs" aria-label="Costo risorse">
            {positiveCosts.map((res) => (
              <span
                key={res}
                className={`epochs-card__cost-pip epochs-card__cost-pip--${res}`}
                data-cost-resource={res}
                data-cost-amount={String(rules.cost[res])}
                aria-label={`${rules.cost[res]} ${RESOURCE_LABELS_IT[res]}`}
              >
                <ResourceIcon resource={res} size={13} />
                <span>{rules.cost[res]}</span>
              </span>
            ))}
          </div>
        </header>

        {/* 2. Illustrazione (47fr): Finestra 4:3 con <picture> o SVG placeholder */}
        <div className="epochs-card__art-frame" data-card-band="illustration">
          {artSlot ?? <CardArtPicture card={resolved} />}
          {coveredForOpponent && (
            <span
              className="epochs-card__covered-badge"
              data-testid={`card-covered-badge-${resolved.id}`}
            >
              Coperta per l&apos;avversario
            </span>
          )}
        </div>

        {/* 3. Riga del Tipo (6fr): es. Unità — Cavalleria · Centro con icona Era */}
        <div className="epochs-card__type-bar" data-card-band="type-line">
          <span className="epochs-card__type-line">
            {rules.type === 'unit' && rules.category !== undefined ? (
              <UnitCategoryIcon category={rules.category} size={13} />
            ) : (
              <CardTypeIcon type={rules.type} size={13} />
            )}
            <span>{text.typeLine}</span>
          </span>
          <span className="epochs-card__era-badge" aria-label={ERA_LABELS_IT[rules.era]}>
            <EraIcon era={rules.era} size={14} />
            <span>{ERA_ROMAN_LABELS[rules.era]}</span>
          </span>
        </div>

        {/* 4. Box Testo (29fr): Testo regole in Alegreya, filetto in ottone, flavor in corsivo */}
        <div className="epochs-card__text-box" data-card-band="text-box">
          <p className="epochs-card__rules-text" data-testid="card-rules-text">
            {rulesText}
          </p>
          <hr className="epochs-card__brass-divider" aria-hidden="true" />
          <p className="epochs-card__flavor-text" data-testid="card-flavor-text">
            {text.flavor}
          </p>
        </div>

        {/* 5. Footer Statistiche (9fr): ATK / DEM / HP per unità, riepilogo per le altre */}
        <footer className="epochs-card__footer" data-card-band="footer">
          {rules.type === 'unit' ? (
            <>
              <span
                className={`epochs-card__stat-badge ${
                  isAtkBuffed ? 'epochs-card__stat-badge--buffed' : ''
                }`}
                data-stat="atk"
                data-stat-state={isAtkBuffed ? 'buffed' : 'normal'}
                aria-label={`${STAT_LABELS_IT.atk}: ${effectiveAtk}`}
              >
                <StatIcon stat="atk" size={14} />
                <span>{effectiveAtk}</span>
              </span>
              <span
                className={`epochs-card__stat-badge ${
                  isDemBuffed ? 'epochs-card__stat-badge--buffed' : ''
                }`}
                data-stat="dem"
                data-stat-state={isDemBuffed ? 'buffed' : 'normal'}
                aria-label={`${STAT_LABELS_IT.dem}: ${effectiveDem}`}
              >
                <StatIcon stat="dem" size={14} />
                <span>{effectiveDem}</span>
              </span>
              <span
                className={`epochs-card__stat-badge ${
                  isHpDamaged ? 'epochs-card__stat-badge--damaged' : ''
                }`}
                data-stat="hp"
                data-stat-state={isHpDamaged ? 'damaged' : 'normal'}
                aria-label={`${STAT_LABELS_IT.hp}: ${effectiveHp} su ${maxHp}`}
              >
                <StatIcon stat="hp" size={14} />
                <span>{isHpDamaged ? `${effectiveHp}/${maxHp}` : effectiveHp}</span>
              </span>
            </>
          ) : rules.type === 'economy' && rules.production !== undefined ? (
            <div className="epochs-card__nonunit-footer" data-stat="production">
              <span>Edificio Economico · 1 Slot</span>
              <span>
                {RESOURCE_ORDER.filter((res) => (rules.production?.[res] ?? 0) > 0)
                  .map((res) => `+${rules.production?.[res]} ${RESOURCE_LABELS_IT[res]}`)
                  .join(' ')}
              </span>
            </div>
          ) : rules.type === 'instant' ? (
            <div className="epochs-card__nonunit-footer" data-stat="instant">
              <span>Pre-Battaglia</span>
              <span>0 Slot</span>
            </div>
          ) : (
            <div className="epochs-card__nonunit-footer" data-stat="conversion">
              <span>Riconversione · Era III</span>
              {rules.line !== undefined && <LineIcon line={rules.line} />}
              <span>0 Slot</span>
            </div>
          )}
        </footer>
      </article>
    </div>
  );
}
