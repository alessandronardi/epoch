import type {
  CardType,
  EraNo,
  Line,
  Resource,
  UnitCategory,
} from '@epochs/engine';
import type { ReactElement } from 'react';

export type StatKind = 'atk' | 'dem' | 'hp' | 'walls' | 'cityCenter';

export interface DomainIconProps {
  readonly size?: number | undefined;
  readonly className?: string | undefined;
  readonly label?: string | undefined;
}

export const RESOURCE_LABELS_IT: Readonly<Record<Resource, string>> =
  Object.freeze({
    food: 'Cibo',
    wood: 'Legno',
    metal: 'Metallo',
  });

export const ERA_ROMAN_LABELS: Readonly<Record<EraNo, 'I' | 'II' | 'III'>> =
  Object.freeze({
    1: 'I',
    2: 'II',
    3: 'III',
  });

export const ERA_LABELS_IT: Readonly<Record<EraNo, string>> = Object.freeze({
  1: 'Era I (Bronzo)',
  2: 'Era II (Acciaio)',
  3: 'Era III (Oro)',
});

export const LINE_LABELS_IT: Readonly<Record<Line, string>> = Object.freeze({
  front: 'Fronte',
  center: 'Centro',
  rear: 'Retroguardia',
});

export const UNIT_CATEGORY_LABELS_IT: Readonly<Record<UnitCategory, string>> =
  Object.freeze({
    infantry: 'Fanteria',
    spearman: 'Lanciere',
    cavalry: 'Cavalleria',
    archer: 'Arciere',
    siege: 'Assedio',
  });

export const STAT_LABELS_IT: Readonly<Record<StatKind, string>> = Object.freeze(
  {
    atk: 'Attacco (ATK)',
    dem: 'Demolizione (DEM)',
    hp: 'Punti Vita (HP)',
    walls: 'Mura',
    cityCenter: 'Centro Città',
  },
);

function getA11ySvgProps(label: string | undefined): {
  readonly role?: 'img';
  readonly 'aria-label'?: string;
  readonly 'aria-hidden'?: true;
} {
  if (label !== undefined && label.length > 0) {
    return {
      role: 'img',
      'aria-label': label,
    };
  }
  return {
    'aria-hidden': true,
  };
}

export interface ResourceIconProps extends DomainIconProps {
  readonly resource: Resource;
}

export function ResourceIcon({
  resource,
  size = 16,
  className,
  label,
}: ResourceIconProps): ReactElement {
  const a11yProps = getA11ySvgProps(label);

  switch (resource) {
    case 'food':
      // Spiga di grano distintiva per Cibo
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="resource-food"
          {...a11yProps}
        >
          <path d="M12 21V9" />
          <path d="M12 6V3" />
          <path d="M12 9C9 9 7 7 7 4c3 0 5 2 5 5Z" />
          <path d="M12 9c3 0 5-2 5-5-3 0-5 2-5 5Z" />
          <path d="M12 14c-3 0-5-2-5-5 3 0 5 2 5 5Z" />
          <path d="M12 14c3 0 5-2 5-5-3 0-5 2-5 5Z" />
          <path d="M12 19c-3 0-5-2-5-5 3 0 5 2 5 5Z" />
          <path d="M12 19c3 0 5-2 5-5-3 0-5 2-5 5Z" />
        </svg>
      );

    case 'wood':
      // Tronchi intagliati distintivi per Legno
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="resource-wood"
          {...a11yProps}
        >
          <ellipse cx="7" cy="14" rx="3" ry="5" />
          <path d="M7 9h11c1.7 0 3 2.2 3 5s-1.3 5-3 5H7" />
          <circle cx="7" cy="14" r="1" />
          <path d="M13 9l2-3" />
          <path d="M14 14h4" />
        </svg>
      );

    case 'metal':
      // Lingotto e piccone incrociati distintivi per Metallo
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="resource-metal"
          {...a11yProps}
        >
          <polygon points="4 18 7 12 17 12 20 18 4 18" />
          <polygon points="7 11 9 6 15 6 17 11 7 11" />
          <path d="M10 15h4" />
        </svg>
      );
  }
}

export interface EraIconProps extends DomainIconProps {
  readonly era: EraNo;
}

export function EraIcon({
  era,
  size = 18,
  className,
  label,
}: EraIconProps): ReactElement {
  const a11yProps = getA11ySvgProps(label);

  // Scudo araldico sagomato per Era (Esagono I, Scudo II, Corona/Ottagono III) con cifre romane incise
  switch (era) {
    case 1:
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="era-1"
          {...a11yProps}
        >
          <polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2" />
          <path d="M12 7v10" />
          <path d="M10 7h4" />
          <path d="M10 17h4" />
        </svg>
      );

    case 2:
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="era-2"
          {...a11yProps}
        >
          <path d="M12 2l8 3v7c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3Z" />
          <path d="M10 7v10" />
          <path d="M14 7v10" />
          <path d="M8.5 7h7" />
          <path d="M8.5 17h7" />
        </svg>
      );

    case 3:
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="era-3"
          {...a11yProps}
        >
          <polygon points="8 2 16 2 22 8 22 16 16 22 8 22 2 16 2 8 8 2" />
          <path d="M8.5 7v10" />
          <path d="M12 7v10" />
          <path d="M15.5 7v10" />
          <path d="M7 7h10" />
          <path d="M7 17h10" />
        </svg>
      );
  }
}

export interface LineIconProps extends DomainIconProps {
  readonly line: Line;
}

export function LineIcon({
  line,
  size = 16,
  className,
  label,
}: LineIconProps): ReactElement {
  const a11yProps = getA11ySvgProps(label);

  // Tre fasce tattiche con la linea attiva evidenziata in pieno e chevron direzionale
  switch (line) {
    case 'front':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="line-front"
          {...a11yProps}
        >
          <rect
            x="3"
            y="4"
            width="18"
            height="4"
            rx="1"
            fill="currentColor"
          />
          <rect x="3" y="10" width="18" height="4" rx="1" opacity="0.45" />
          <rect x="3" y="16" width="18" height="4" rx="1" opacity="0.45" />
        </svg>
      );

    case 'center':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="line-center"
          {...a11yProps}
        >
          <rect x="3" y="4" width="18" height="4" rx="1" opacity="0.45" />
          <rect
            x="3"
            y="10"
            width="18"
            height="4"
            rx="1"
            fill="currentColor"
          />
          <rect x="3" y="16" width="18" height="4" rx="1" opacity="0.45" />
        </svg>
      );

    case 'rear':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="line-rear"
          {...a11yProps}
        >
          <rect x="3" y="4" width="18" height="4" rx="1" opacity="0.45" />
          <rect x="3" y="10" width="18" height="4" rx="1" opacity="0.45" />
          <rect
            x="3"
            y="16"
            width="18"
            height="4"
            rx="1"
            fill="currentColor"
          />
        </svg>
      );
  }
}

export interface UnitCategoryIconProps extends DomainIconProps {
  readonly category: UnitCategory;
}

export function UnitCategoryIcon({
  category,
  size = 16,
  className,
  label,
}: UnitCategoryIconProps): ReactElement {
  const a11yProps = getA11ySvgProps(label);

  switch (category) {
    case 'infantry':
      // Spada corta e scudo rotondo
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="category-infantry"
          {...a11yProps}
        >
          <path d="M14.5 4.5 19.5 9.5 8 21 3 21 3 16 14.5 4.5Z" />
          <path d="M12 7l5 5" />
        </svg>
      );

    case 'spearman':
      // Lancia lunga diagonale con punta a losanga (Impalamento)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="category-spearman"
          {...a11yProps}
        >
          <path d="M3 21L17 7" />
          <polygon points="21 3 19 10 14 5 21 3" />
          <path d="M6 14l4 4" />
        </svg>
      );

    case 'cavalry':
      // Profilo di destriero / ferro di cavallo con stendardo (Accerchiamento)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="category-cavalry"
          {...a11yProps}
        >
          <path d="M7 20v-4c0-4 2-7 5-9l2-4 4 2-1 4 3 2-2 3-4-1c-1 2-1 4-1 7H7Z" />
          <path d="M5 20h14" />
        </svg>
      );

    case 'archer':
      // Arco teso e freccia incoccata (Tiro)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="category-archer"
          {...a11yProps}
        >
          <path d="M5 3c8 3 8 15 0 18" />
          <path d="M5 3v18" />
          <path d="M3 12h17" />
          <polyline points="16 8 20 12 16 16" />
        </svg>
      );

    case 'siege':
      // Ruota d'assedio / catapulta pesante (Demolizione)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="category-siege"
          {...a11yProps}
        >
          <circle cx="7" cy="17" r="3" />
          <circle cx="17" cy="17" r="3" />
          <path d="M3 17h18" />
          <path d="M8 14L18 5" />
          <circle cx="19" cy="5" r="2" />
          <path d="M12 17V9" />
        </svg>
      );
  }
}

export interface CardTypeIconProps extends DomainIconProps {
  readonly type: CardType;
}

export function CardTypeIcon({
  type,
  size = 16,
  className,
  label,
}: CardTypeIconProps): ReactElement {
  const a11yProps = getA11ySvgProps(label);

  switch (type) {
    case 'economy':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="type-economy"
          {...a11yProps}
        >
          <path d="M3 21h18" />
          <path d="M5 21V9l7-5 7 5v12" />
          <rect x="9" y="13" width="6" height="8" />
        </svg>
      );

    case 'unit':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="type-unit"
          {...a11yProps}
        >
          <path d="M4 20L20 4" />
          <path d="M15 4h5v5" />
          <path d="M20 20L4 4" />
          <path d="M9 4H4v5" />
        </svg>
      );

    case 'instant':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="type-instant"
          {...a11yProps}
        >
          <polygon points="13 2 4 14 11 14 10 22 20 10 13 10 13 2" />
        </svg>
      );

    case 'conversion':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="type-conversion"
          {...a11yProps}
        >
          <path d="M17 2l4 4-4 4" />
          <path d="M3 11V9a3 3 0 0 1 3-3h15" />
          <path d="M7 22l-4-4 4-4" />
          <path d="M21 13v2a3 3 0 0 1-3 3H3" />
        </svg>
      );
  }
}

export interface StatIconProps extends DomainIconProps {
  readonly stat: StatKind;
}

export function StatIcon({
  stat,
  size = 16,
  className,
  label,
}: StatIconProps): ReactElement {
  const a11yProps = getA11ySvgProps(label);

  switch (stat) {
    case 'atk':
      // Spada per ATK (§9.3)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="stat-atk"
          {...a11yProps}
        >
          <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
          <line x1="13" y1="19" x2="19" y2="13" />
          <line x1="16" y1="16" x2="20" y2="20" />
          <line x1="19" y1="21" x2="21" y2="19" />
        </svg>
      );

    case 'dem':
      // Ariete / Torre merlata infranta per DEM (§9.3)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="stat-dem"
          {...a11yProps}
        >
          <path d="M4 21h16" />
          <path d="M6 21V7h3v2h2V7h2v2h2V7h3v14" />
          <path d="M10 14l4-3-2 5 3-1" />
        </svg>
      );

    case 'hp':
      // Scudo corazzato per HP (§9.3)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="stat-hp"
          {...a11yProps}
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="M12 8v8" />
          <path d="M8 12h8" />
        </svg>
      );

    case 'walls':
      // Bastione merlato per Mura
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="stat-walls"
          {...a11yProps}
        >
          <path d="M3 20h18V8h-3v3h-3V8h-6v3H6V8H3v12Z" />
          <line x1="3" y1="14" x2="21" y2="14" />
        </svg>
      );

    case 'cityCenter':
      // Cittadella / Rocca centrale per Centro Città
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-domain-icon="stat-cityCenter"
          {...a11yProps}
        >
          <path d="M3 21h18" />
          <path d="M5 21V11l7-7 7 7v10" />
          <path d="M9 21v-6h6v6" />
          <circle cx="12" cy="11" r="1.5" />
        </svg>
      );
  }
}
