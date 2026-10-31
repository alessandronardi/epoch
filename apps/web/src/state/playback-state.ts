import { getCard } from '@epochs/content';
import type { GameEvent, PlayerId, PlayerView, UnitInstance } from '@epochs/engine';

export type PlaybackUnits = Readonly<Record<PlayerId, readonly UnitInstance[]>>;

/** Events contain resolved effects. This reducer never calculates combat rules. */
export function applyPlaybackUnits(units: PlaybackUnits, event: GameEvent): PlaybackUnits {
  if (event.type === 'UnitsRevealed' || (event.type === 'BattleStarted' && event.units)) {
    return structuredClone(event.units!);
  }
  if (event.type === 'EraEnded') return { P1: [], P2: [] };
  if (event.type !== 'BattlePhaseResolved') return units;
  const update = (owner: PlayerId): UnitInstance[] => {
    const attacker = owner === 'P1' ? 'P2' : 'P1';
    return units[owner].map((unit) => ({
      ...unit,
      hp: Math.max(
        0,
        unit.hp -
          event.assignments[attacker]
            .filter((assignment) => assignment.uid === unit.uid)
            .reduce((sum, assignment) => sum + assignment.damage, 0),
      ),
    }));
  };
  // Keep zero-HP casualties visible during impact. Removal is a separate presentation step.
  return { P1: update('P1'), P2: update('P2') };
}

export function removePlaybackCasualties(units: PlaybackUnits, event: GameEvent): PlaybackUnits {
  if (event.type !== 'BattlePhaseResolved') return units;
  const survivors = (owner: PlayerId) =>
    units[owner].filter((unit) => unit.hp > 0 && !event.casualties[owner].includes(unit.uid));
  return { P1: survivors('P1'), P2: survivors('P2') };
}

export function withPlaybackUnits(view: PlayerView, units: PlaybackUnits): PlayerView {
  const opponent = view.me === 'P1' ? 'P2' : 'P1';
  return {
    ...view,
    self: { ...view.self, units: units[view.me].map((unit) => ({ ...unit })) },
    opponent: { ...view.opponent, units: units[opponent].map((unit) => ({ ...unit })) },
  };
}

export function applyPlaybackView(
  previous: PlayerView | null,
  event: GameEvent,
  units: PlaybackUnits,
): PlayerView | null {
  if (!previous) return null;
  let view = structuredClone(previous);
  const opponent = view.me === 'P1' ? 'P2' : 'P1';
  switch (event.type) {
    case 'UnitsRevealed':
      view.era = event.era;
      view.phase = 'prebattle';
      view.toAct = null;
      view.self.resources = { ...event.resources[view.me] };
      view.opponent.resources = { ...event.resources[opponent] };
      if (previous.phase !== 'prebattle')
        view.opponent.coveredCount = Math.max(
          0,
          view.opponent.coveredCount - event.units[opponent].length,
        );
      view = withPlaybackUnits(view, units);
      break;
    case 'BattleStarted':
      view.era = event.era;
      view.phase = 'prebattle';
      view.toAct = null;
      view = withPlaybackUnits(view, units);
      break;
    case 'BattlePhaseResolved':
      view = withPlaybackUnits(view, units);
      break;
    case 'InstantsRevealed': {
      const played = new Set(event.played[view.me].map((card) => card.uid));
      view.self.discard.push(...view.self.hand.filter((card) => played.has(card.uid)));
      view.self.hand = view.self.hand.filter((card) => !played.has(card.uid));
      view.opponent.handCount = Math.max(
        0,
        view.opponent.handCount - event.played[opponent].length,
      );
      view.opponent.discardCount += event.played[opponent].length;
      view.opponent.publicDiscard.push(...event.played[opponent].map((card) => card.cardId));
      break;
    }
    case 'PlayerCommitted':
      if (event.player === view.me) view.self.committed = true;
      else view.opponent.committed = true;
      break;
    case 'ResourcesChanged':
      if (event.player === view.me) view.self.resources = { ...event.resources };
      else if (view.opponent.resources !== null) view.opponent.resources = { ...event.resources };
      break;
    case 'WallsModified':
      view.self.walls = event.wallsAfter[view.me];
      view.opponent.walls = event.wallsAfter[opponent];
      break;
    case 'SiegeResolved': {
      const defender = event.defender === view.me ? view.self : view.opponent;
      defender.walls = event.wallsAfter;
      defender.cityHp = event.cityHpAfter;
      defender.cityDamage += event.directDamage;
      break;
    }
    // Resource balances are already supplied by ResourcesChanged, including capped raids.
    case 'EraEnded':
      view = withPlaybackUnits(view, units);
      break;
    case 'EraStarted':
      view.era = event.era;
      view.phase = 'hand_limit';
      view.initiative = event.initiative;
      view.toAct = null;
      view.opponent.resources = null;
      view.opponent.units = null;
      view.self.units = [];
      for (const [id, side] of [
        [view.me, view.self],
        [opponent, view.opponent],
      ] as const) {
        side.walls = event.walls[id];
        side.cityHp = event.cityHp[id];
        side.cityMax = event.cityMax[id];
        side.passed = false;
        side.committed = false;
        side.slotsUsed = 0;
      }
      break;
    case 'CycleStarted':
      view.era = event.era;
      view.phase = 'development';
      view.cycle = event.cycle;
      view.toAct = event.toAct;
      view.opponent.resources = null;
      view.opponent.units = null;
      break;
    case 'CardsDrawn':
      if (event.player === view.me && event.cards) {
        const existing = new Set(view.self.hand.map((card) => card.uid));
        view.self.hand.push(...event.cards.filter((card) => !existing.has(card.uid)));
      }
      break;
    default:
      break;
  }
  return view;
}

function name(cardId: string, version: PlayerView['catalogVersion']): string {
  try {
    return getCard(cardId, version).text.name;
  } catch {
    return cardId;
  }
}

export function describeBattleDetails(
  event: GameEvent,
  units: PlaybackUnits,
  version: PlayerView['catalogVersion'] = '1.0',
): string[] {
  if (event.type !== 'BattlePhaseResolved') return [];
  const details: string[] = [];
  for (const attacker of ['P1', 'P2'] as const) {
    const defender = attacker === 'P1' ? 'P2' : 'P1';
    for (const contribution of event.contributions?.[attacker] ?? []) {
      const reason =
        contribution.furyBonus || contribution.disciplineBonus
          ? [
              contribution.furyBonus ? `Furia ${contribution.furyBonus}` : '',
              contribution.disciplineBonus ? `Disciplina ${contribution.disciplineBonus}` : '',
            ]
              .filter(Boolean)
              .join(' + ')
          : contribution.rule === 'volley'
            ? 'contro Lancieri'
            : contribution.rule === 'flank'
              ? 'contro Arcieri'
              : 'bonus';
      const calculation = contribution.bonus
        ? `${contribution.baseDamage} + ${contribution.bonus} ${reason} = ${contribution.totalDamage}`
        : String(contribution.totalDamage);
      const rule =
        contribution.rule === 'archer_melee'
          ? ' (ATK effettivo dimezzato, minimo 1)'
          : contribution.rule === 'impale'
            ? ' (Impalamento)'
            : contribution.rule === 'flank'
              ? ' (Accerchiamento)'
              : '';
      details.push(
        `${attacker} · ${name(contribution.cardId, version)}: ${calculation} danni${rule}.`,
      );
    }
    let assigned = 0;
    for (const assignment of event.assignments[attacker]) {
      assigned += assignment.damage;
      const target = units[defender].find((unit) => unit.uid === assignment.uid);
      const fallen = event.casualties[defender].includes(assignment.uid);
      details.push(
        `${defender} · ${target ? name(target.cardId, version) : assignment.uid}: ${assignment.damage} danni${target ? `, HP ${target.hp} → ${Math.max(0, target.hp - assignment.damage)}` : ''}${fallen ? ', caduto' : ''}.`,
      );
    }
    const excess = event.damageDealt[attacker] - assigned;
    if (excess > 0)
      details.push(`${attacker}: ${excess} danni non assegnati, nessun altro bersaglio valido.`);
  }
  return details;
}
