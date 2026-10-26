import type {
  CardInstance,
  Line,
  PlayerView,
  PublicUnitView,
  UnitInstance,
} from '@epochs/engine';
import type { CSSProperties, ReactElement } from 'react';
import { UNIT_REVEAL_CASCADE_MS } from '../../state/game-store.js';
import { Card } from '../card/Card.js';
import { CardToken } from '../card/CardToken.js';
import {
  CardTypeIcon,
  LINE_LABELS_IT,
  LineIcon,
} from '../icons/DomainIcons.js';
import './board.css';

export const BATTLE_LINES_ORDER: readonly Line[] = ['front', 'center', 'rear'];

export type DisplayUnit = UnitInstance | PublicUnitView;

export interface CityAndLinesProps {
  readonly side: 'self' | 'opponent';
  readonly view: PlayerView;
  readonly revealedUnitUids?: readonly string[] | undefined;
  readonly isRevealingUnits?: boolean | undefined;
  readonly playbackUnits?: readonly DisplayUnit[] | undefined;
  readonly isBattlePlaybackActive?: boolean | undefined;
  readonly selectedBuildingUid?: string | null | undefined;
  readonly isDroppableOver?: boolean | undefined;
  readonly onInspectCard?: ((cardId: string) => void) | undefined;
  readonly onSelectBuilding?: ((building: CardInstance) => void) | undefined;
  readonly onSelectUnit?: ((unit: DisplayUnit) => void) | undefined;
}

function isPrebattleOrLater(phase: PlayerView['phase']): boolean {
  return phase === 'prebattle' || phase === 'finished';
}

export function CityAndLines({
  side,
  view,
  revealedUnitUids,
  isRevealingUnits = false,
  playbackUnits,
  isBattlePlaybackActive = false,
  selectedBuildingUid,
  isDroppableOver = false,
  onInspectCard,
  onSelectBuilding,
  onSelectUnit,
}: CityAndLinesProps): ReactElement {
  const inBattleStage =
    isPrebattleOrLater(view.phase) || isBattlePlaybackActive;

  const demBonus =
    side === 'self' ? view.self.demBonus : view.opponent.demBonus;

  // Determina le unità visibili sulle 3 linee di battaglia (§9.2 riga 795)
  const activeLineUnits: readonly DisplayUnit[] = (() => {
    if (
      isBattlePlaybackActive &&
      playbackUnits !== undefined &&
      playbackUnits.length > 0
    ) {
      return playbackUnits;
    }
    if (!isPrebattleOrLater(view.phase)) {
      return [];
    }
    if (side === 'self') {
      return view.self.units;
    }
    return view.opponent.units ?? [];
  })();

  // Assegna un indice progressivo di cascata a ogni unità schierata per l'animazione 120ms (§9.1)
  const sortedAllLineUnits = [...activeLineUnits].sort(
    (a, b) => a.seq - b.seq,
  );
  const cascadeIndexByUid = new Map<string, number>();
  sortedAllLineUnits.forEach((u, index) => {
    cascadeIndexByUid.set(u.uid, index);
  });

  // Carte mostrate nella Zona "Città" del proprietario:
  // in development: Edifici + Unità coperte; da prebattle in poi: solo Edifici Economici (§9.2 riga 795)
  const selfCityBuildings: readonly CardInstance[] =
    side === 'self' ? view.self.buildings : [];
  const selfCityCoveredUnits: readonly UnitInstance[] =
    side === 'self' && !inBattleStage ? view.self.units : [];

  const opponentStackLayers = Math.min(
    4,
    Math.max(0, view.opponent.coveredCount),
  );

  return (
    <section
      className={`city-and-lines city-and-lines--${side}`}
      data-testid={`${side}-city-and-lines`}
      aria-label={
        side === 'self'
          ? 'Il tuo schieramento: Città e Linee di Battaglia'
          : 'Schieramento avversario: Città coperta e Linee di Battaglia'
      }
    >
      {/* 1. Zona "Città" */}
      <div
        className={`board-zone board-zone--city ${
          isDroppableOver ? 'board-zone--droppable-active' : ''
        }`.trim()}
        data-testid={`${side}-city-zone`}
        data-covered-count={
          side === 'opponent'
            ? String(view.opponent.coveredCount)
            : String(selfCityBuildings.length + selfCityCoveredUnits.length)
        }
      >
        <header className="board-zone__header">
          <span className="board-zone__title">
            <CardTypeIcon type="economy" size={14} />
            <span>{side === 'self' ? 'Città (tua)' : 'Città coperta'}</span>
          </span>
          <span className="board-zone__count">
            {side === 'opponent'
              ? `${view.opponent.coveredCount} coperte`
              : `${selfCityBuildings.length + selfCityCoveredUnits.length} carte`}
          </span>
        </header>

        <div className="board-zone__content">
          {side === 'opponent' ? (
            view.opponent.coveredCount > 0 ? (
              <div
                className="covered-stack"
                data-testid="opponent-covered-stack"
                aria-label={`Città avversaria: ${view.opponent.coveredCount} ${
                  view.opponent.coveredCount === 1
                    ? 'carta coperta'
                    : 'carte coperte'
                }`}
              >
                <div className="covered-stack__cards" aria-hidden="true">
                  {Array.from({ length: opponentStackLayers }).map((_, idx) => (
                    <div
                      key={idx}
                      className="covered-stack__card-back"
                      style={{
                        top: `${idx * 3}px`,
                        left: `${idx * 3}px`,
                      }}
                    />
                  ))}
                </div>
                <div className="covered-stack__meta">
                  <span
                    className="covered-stack__number"
                    data-testid="opponent-covered-count-badge"
                  >
                    {view.opponent.coveredCount}
                  </span>
                  <span className="covered-stack__label">
                    {inBattleStage
                      ? 'Edifici Economici coperti'
                      : 'Edifici e Unità coperte'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="board-zone__empty">
                Nessuna carta coperta nella Città avversaria
              </div>
            )
          ) : selfCityBuildings.length === 0 &&
            selfCityCoveredUnits.length === 0 ? (
            <div className="board-zone__empty">
              {inBattleStage
                ? 'Nessun Edificio Economico attivo'
                : 'Trascina o gioca qui Edifici e Unità coperte'}
            </div>
          ) : (
            <>
              {selfCityBuildings.map((building) => {
                const isSelected = selectedBuildingUid === building.uid;
                return (
                  <div
                    key={building.uid}
                    className="board-city-item"
                    data-testid={`self-city-building-${building.uid}`}
                  >
                    <div className="board-city-card--desktop">
                      <Card
                        cardId={building.cardId}
                        coveredForOpponent
                        selected={isSelected}
                        onSelect={() => onSelectBuilding?.(building)}
                        onInspect={onInspectCard}
                      />
                    </div>
                    <div className="board-city-token--mobile">
                      <CardToken
                        cardId={building.cardId}
                        onSelect={() => onSelectBuilding?.(building)}
                        onInspect={onInspectCard}
                      />
                    </div>
                  </div>
                );
              })}

              {selfCityCoveredUnits.map((unit) => (
                <div
                  key={unit.uid}
                  className="board-city-item"
                  data-testid={`self-city-covered-unit-${unit.uid}`}
                >
                  <div className="board-city-card--desktop">
                    <Card
                      cardId={unit.cardId}
                      atkMod={unit.atkMod}
                      demBonus={demBonus}
                      currentHp={unit.hp}
                      coveredForOpponent
                      onSelect={() => onSelectUnit?.(unit)}
                      onInspect={onInspectCard}
                    />
                  </div>
                  <div className="board-city-token--mobile">
                    <CardToken
                      cardId={unit.cardId}
                      atkMod={unit.atkMod}
                      demBonus={demBonus}
                      currentHp={unit.hp}
                      onSelect={() => onSelectUnit?.(unit)}
                      onInspect={onInspectCard}
                    />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* 2. Le 3 Linee di Battaglia: Fronte, Centro, Retroguardia */}
      {BATTLE_LINES_ORDER.map((line) => {
        const lineUnits = sortedAllLineUnits.filter((u) => u.line === line);
        const queuedCoveredUnitsCount =
          side === 'self' && !inBattleStage
            ? view.self.units.filter((u) => u.line === line).length
            : 0;

        return (
          <div
            key={line}
            className={`board-zone board-zone--line board-zone--line-${line}`}
            data-testid={`${side}-line-${line}`}
            data-line={line}
            data-unit-count={String(lineUnits.length)}
          >
            <header className="board-zone__header">
              <span className="board-zone__title">
                <LineIcon line={line} size={14} />
                <span>{LINE_LABELS_IT[line]}</span>
              </span>
              <span className="board-zone__count">
                {inBattleStage
                  ? `${lineUnits.length} unità`
                  : queuedCoveredUnitsCount > 0
                    ? `${queuedCoveredUnitsCount} pronte`
                    : '0 unità'}
              </span>
            </header>

            <div className="board-zone__content">
              {!inBattleStage ? (
                <div className="board-zone__empty">
                  {side === 'opponent'
                    ? 'Coperte fino alla Pre-Battaglia'
                    : queuedCoveredUnitsCount > 0
                      ? `${queuedCoveredUnitsCount} unità coperte pronte per ${LINE_LABELS_IT[line]}`
                      : `Nessuna unità su ${LINE_LABELS_IT[line]}`}
                </div>
              ) : lineUnits.length === 0 ? (
                <div className="board-zone__empty">Linea vuota</div>
              ) : (
                lineUnits.map((unit) => {
                  const cascadeIdx = cascadeIndexByUid.get(unit.uid) ?? 0;
                  const isUnitRevealed =
                    !isRevealingUnits ||
                    revealedUnitUids === undefined ||
                    revealedUnitUids.includes(unit.uid);

                  const slotStyle: CSSProperties = {
                    '--cascade-delay': `${cascadeIdx * UNIT_REVEAL_CASCADE_MS}ms`,
                  } as CSSProperties;

                  return (
                    <div
                      key={unit.uid}
                      className={`board-unit-slot ${
                        isUnitRevealed
                          ? 'board-unit-slot--revealed'
                          : 'board-unit-slot--revealing'
                      }`}
                      style={slotStyle}
                      data-testid={`board-unit-${unit.uid}`}
                      data-unit-uid={unit.uid}
                      data-unit-card-id={unit.cardId}
                      data-unit-seq={String(unit.seq)}
                      data-reveal-state={
                        isUnitRevealed ? 'revealed' : 'revealing'
                      }
                      data-cascade-index={String(cascadeIdx)}
                    >
                      <div className="board-unit-card--desktop">
                        <Card
                          cardId={unit.cardId}
                          atkMod={unit.atkMod}
                          demBonus={demBonus}
                          currentHp={unit.hp}
                          onSelect={() => onSelectUnit?.(unit)}
                          onInspect={onInspectCard}
                        />
                      </div>
                      <div className="board-unit-token--mobile">
                        <CardToken
                          cardId={unit.cardId}
                          atkMod={unit.atkMod}
                          demBonus={demBonus}
                          currentHp={unit.hp}
                          onSelect={() => onSelectUnit?.(unit)}
                          onInspect={onInspectCard}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
