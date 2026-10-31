import {
  LOGISTICS_CAP_BY_ERA,
  STORAGE_CAP_BY_ERA,
  getOpponent,
  type PlayerView,
  type Resource,
} from '@epochs/engine';
import { Flag, LayoutGrid } from 'lucide-react';
import { CIVILIZATIONS, getCard } from '@epochs/content';
import type { ReactElement } from 'react';
import { ResourceIcon, RESOURCE_LABELS_IT, StatIcon } from '../icons/DomainIcons.js';

const RESOURCES: readonly Resource[] = ['food', 'wood', 'metal'];

/** Shared ordering makes the two cities directly comparable. Names remain available to AT. */
export function PlayerStatus({
  view,
  side,
}: {
  readonly view: PlayerView;
  readonly side: 'self' | 'opponent';
}): ReactElement {
  const player = view[side];
  const own = side === 'self';
  const name = own ? 'Tu' : 'Avversario';
  const playerId = own ? view.me : getOpponent(view.me);
  const capacity = LOGISTICS_CAP_BY_ERA[view.era];
  return (
    <header
      className={`board-status-bar board-status-bar--${side}`}
      data-testid={`${side}-status-bar`}
      aria-label={own ? 'Il tuo stato' : 'Stato avversario'}
    >
      <div className="board-status-bar__identity">
        <span>{name}</span>
        {player.civilizationId && (
          <span title={CIVILIZATIONS[player.civilizationId].description}>
            {CIVILIZATIONS[player.civilizationId].name}
          </span>
        )}
        {(player.structures ?? []).length > 0 && (
          <span aria-label="Strutture pubbliche">
            {player
              .structures!.map((c) => getCard(c.cardId, view.catalogVersion).text.name)
              .join(' · ')}
          </span>
        )}
        {view.initiative === playerId && (
          <span
            className="board-initiative"
            data-testid={`${side}-initiative-badge`}
            role="img"
            aria-label="Iniziativa"
            title="Iniziativa"
          >
            <Flag size={21} aria-hidden="true" />
          </span>
        )}
      </div>
      {!own && <PlayerResources view={view} side="opponent" />}
      <div className="board-status-bar__group">
        {player.passed && (
          <span className="board-badge board-badge--brass" data-testid={`${side}-passed-badge`}>
            {own ? 'Hai passato' : 'Ha passato'}
          </span>
        )}
        {!own && view.opponent.committed && (
          <span className="board-badge board-badge--brass" data-testid="opponent-committed-badge">
            Scelta bloccata
          </span>
        )}
        {player.demBonus > 0 && (
          <span
            className="board-badge board-badge--brass"
            data-testid={`${side}-dem-bonus`}
            title="Bonus demolizione"
            aria-label={`Bonus demolizione: ${player.demBonus}`}
          >
            <StatIcon stat="dem" size={20} />+{player.demBonus}
          </span>
        )}
        <span
          className="board-badge"
          data-testid={`${side}-walls`}
          title="Mura"
          aria-label={`${own ? 'Le tue Mura' : 'Mura avversario'}: ${player.walls}`}
        >
          <StatIcon stat="walls" size={24} />
          <strong>{player.walls}</strong>
        </span>
        <span
          className={`board-badge ${player.cityHp < player.cityMax ? 'board-badge--crimson' : ''}`}
          data-testid={`${side}-city-hp`}
          title="Centro città"
          aria-label={`${own ? 'Il tuo Centro Città' : 'Centro Città avversario'}: ${player.cityHp} su ${player.cityMax}`}
        >
          <StatIcon stat="cityCenter" size={24} />
          <strong>
            {player.cityHp}
            <small>/{player.cityMax}</small>
          </strong>
        </span>
        <span
          className="board-badge"
          data-testid={`${side}-slots`}
          title="Capacità logistica"
          aria-label={`Slot logistici ${own ? 'usati' : 'avversario'}: ${player.slotsUsed} su ${capacity}`}
        >
          <LayoutGrid size={23} aria-hidden="true" />
          <strong>
            {player.slotsUsed}
            <small>/{capacity}</small>
          </strong>
        </span>
      </div>
    </header>
  );
}

export function PlayerResources({
  view,
  side = 'self',
}: {
  readonly view: PlayerView;
  readonly side?: 'self' | 'opponent';
}): ReactElement | null {
  const resources = view[side].resources;
  if (resources === null) return null;
  const capacity = STORAGE_CAP_BY_ERA[view.era];
  return (
    <div
      className="board-resources"
      data-testid={`${side}-resources`}
      aria-label={side === 'self' ? 'Le tue risorse' : 'Risorse avversario'}
    >
      {RESOURCES.map((resource) => {
        const label = `${RESOURCE_LABELS_IT[resource]}: ${resources[resource]} su ${capacity}`;
        return (
          <span
            key={resource}
            className={`board-resource-pip board-resource-pip--${resource}`}
            data-testid={`${side}-resource-${resource}`}
            aria-label={label}
            title={label}
          >
            <ResourceIcon resource={resource} size={30} />
            <strong>{resources[resource]}</strong>
          </span>
        );
      })}
    </div>
  );
}
