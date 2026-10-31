import { useBoardCardInspection } from './BoardCardInspection.js';
import { useCatalogVersion } from '../../content/use-catalog-version.js';
import type { CatalogCard } from '@epochs/content';
import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactElement } from 'react';
import {
  LINE_LABELS_IT,
  LineIcon,
  STAT_LABELS_IT,
  StatIcon,
  UNIT_CATEGORY_LABELS_IT,
  UnitCategoryIcon,
} from '../icons/DomainIcons.js';
import { getCardPlaceholderUrl, LONG_PRESS_MS, resolveCatalogCard } from './Card.js';
import './card.css';

export interface CardTokenProps {
  readonly cardId?: string | undefined;
  readonly card?: CatalogCard | undefined;
  readonly atkMod?: number | undefined;
  readonly demBonus?: number | undefined;
  readonly currentHp?: number | undefined;
  readonly onSelect?: ((cardId: string) => void) | undefined;
  readonly onInspect?: ((cardId: string) => void) | undefined;
  readonly className?: string | undefined;
}

export function CardToken({
  cardId,
  card,
  atkMod = 0,
  demBonus = 0,
  currentHp,
  onSelect,
  onInspect,
  className,
}: CardTokenProps): ReactElement {
  const version = useCatalogVersion();
  const resolved = resolveCatalogCard(cardId, card, version);
  const { rules, text, art } = resolved;

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
    inspect?.(resolved.id);
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

  const baseAtk = rules.atk ?? 0;
  const effectiveAtk = baseAtk + atkMod;
  const isAtkBuffed = atkMod > 0;

  const baseDem = rules.dem ?? 0;
  const effectiveDem = baseDem + demBonus;
  const isDemBuffed = demBonus > 0;

  const maxHp = rules.hp ?? 0;
  const effectiveHp = currentHp ?? maxHp;
  const isHpDamaged = currentHp !== undefined && currentHp < maxHp;

  return (
    <div
      ref={inspection?.ref}
      role="button"
      tabIndex={0}
      className={`epochs-card-token touch-target ${className ?? ''}`.trim()}
      data-testid={`card-token-${resolved.id}`}
      data-card-id={resolved.id}
      data-era={String(rules.era)}
      aria-label={`${text.name} (Token): ATK ${effectiveAtk}, DEM ${effectiveDem}, HP ${effectiveHp}`}
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
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="epochs-card-token__thumb">
        <img src={getCardPlaceholderUrl(resolved.id)} alt={art.alt.it} loading="lazy" />
      </div>
      <div className="epochs-card-token__body">
        <div className="epochs-card-token__header">
          <span className="epochs-card-token__title">{text.name}</span>
          <span className="epochs-card-token__icons">
            {rules.category !== undefined && (
              <UnitCategoryIcon
                category={rules.category}
                size={13}
                label={UNIT_CATEGORY_LABELS_IT[rules.category]}
              />
            )}
            {rules.line !== undefined && (
              <LineIcon line={rules.line} size={13} label={LINE_LABELS_IT[rules.line]} />
            )}
          </span>
        </div>
        <div className="epochs-card-token__stats">
          <span
            className={`epochs-card-token__stat ${
              isAtkBuffed ? 'epochs-card-token__stat--buffed' : ''
            }`}
            data-token-stat="atk"
            data-stat-state={isAtkBuffed ? 'buffed' : 'normal'}
            aria-label={`${STAT_LABELS_IT.atk}: ${effectiveAtk}`}
          >
            <StatIcon stat="atk" size={12} />
            <span>{effectiveAtk}</span>
          </span>
          <span
            className={`epochs-card-token__stat ${
              isDemBuffed ? 'epochs-card-token__stat--buffed' : ''
            }`}
            data-token-stat="dem"
            data-stat-state={isDemBuffed ? 'buffed' : 'normal'}
            aria-label={`${STAT_LABELS_IT.dem}: ${effectiveDem}`}
          >
            <StatIcon stat="dem" size={12} />
            <span>{effectiveDem}</span>
          </span>
          <span
            className={`epochs-card-token__stat ${
              isHpDamaged ? 'epochs-card-token__stat--damaged' : ''
            }`}
            data-token-stat="hp"
            data-stat-state={isHpDamaged ? 'damaged' : 'normal'}
            aria-label={`${STAT_LABELS_IT.hp}: ${effectiveHp}`}
          >
            <StatIcon stat="hp" size={12} />
            <span>{effectiveHp}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
