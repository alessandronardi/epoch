import { getCard, type CatalogCard } from '@epochs/content';
import type { ReactElement } from 'react';

export const CARD_ART_WIDTHS = Object.freeze([256, 512, 1024] as const);
export type CardArtFormat = 'avif' | 'webp';

export interface CardArtPictureProps {
  readonly cardId?: string | undefined;
  readonly card?: CatalogCard | undefined;
  readonly sizes?: string | undefined;
  readonly className?: string | undefined;
  readonly imgClassName?: string | undefined;
  readonly loading?: 'lazy' | 'eager' | undefined;
}

export function getCardPlaceholderUrl(cardId: string): string {
  return `/cards/placeholders/${cardId}.svg`;
}

export function getCardArtVariantUrl(
  cardId: string,
  width: 256 | 512 | 1024,
  format: CardArtFormat,
): string {
  return `/cards/${cardId}-${width}.${format}`;
}

export function getCardArtSrcSet(
  cardId: string,
  format: CardArtFormat,
): string {
  return CARD_ART_WIDTHS.map(
    (width) => `${getCardArtVariantUrl(cardId, width, format)} ${width}w`,
  ).join(', ');
}

function resolveArtCard(
  cardId: string | undefined,
  card: CatalogCard | undefined,
): CatalogCard {
  if (card !== undefined) {
    return card;
  }
  if (cardId !== undefined) {
    return getCard(cardId);
  }
  throw new Error(
    'CardArtPicture requires either a card or cardId prop to render.',
  );
}

export function CardArtPicture({
  cardId,
  card,
  sizes = '(max-width: 640px) 256px, (max-width: 1100px) 512px, 1024px',
  className = 'epochs-card__art-picture',
  imgClassName = 'epochs-card__art-img',
  loading = 'lazy',
}: CardArtPictureProps): ReactElement {
  const resolved = resolveArtCard(cardId, card);
  const { id, art } = resolved;

  return (
    <picture
      className={className}
      data-testid={`card-art-picture-${id}`}
      data-card-art-status={art.status}
    >
      <source
        type="image/avif"
        srcSet={getCardArtSrcSet(id, 'avif')}
        sizes={sizes}
      />
      <source
        type="image/webp"
        srcSet={getCardArtSrcSet(id, 'webp')}
        sizes={sizes}
      />
      <img
        className={imgClassName}
        src={getCardPlaceholderUrl(id)}
        alt={art.alt.it}
        width={1536}
        height={1152}
        loading={loading}
        decoding="async"
      />
    </picture>
  );
}
