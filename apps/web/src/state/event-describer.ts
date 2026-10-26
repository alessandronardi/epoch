import {
  getCard,
  type SupportedLocale,
} from '@epochs/content';
import type {
  BattleOutcomeKind,
  BattlePhaseId,
  EraNo,
  GameEvent,
  GameResultKind,
  PassReason,
  PendingWindow,
  Resource,
  ResourceChangeReason,
  ResourceOverflowReason,
  Resources,
} from '@epochs/engine';

export const ERA_ROMAN_BY_NO: Readonly<Record<EraNo, 'I' | 'II' | 'III'>> =
  Object.freeze({
    1: 'I',
    2: 'II',
    3: 'III',
  });

export const BATTLE_PHASE_LABELS_IT: Readonly<Record<BattlePhaseId, string>> =
  Object.freeze({
    phase1_volley: 'Fase 1: Tiro',
    phase2a_impale: 'Fase 2A: Impalamento',
    phase2b_impact: 'Fase 2B: Impatto/Accerchiamento',
    phase3_melee: 'Fase 3: Mischia',
  });

const RESOURCE_ORDER: readonly Resource[] = ['food', 'wood', 'metal'];

const RESOURCE_NAMES_IT: Readonly<Record<Resource, string>> = Object.freeze({
  food: 'Cibo',
  wood: 'Legno',
  metal: 'Metallo',
});

const RESOURCE_REASON_LABELS_IT: Readonly<Record<ResourceChangeReason, string>> =
  Object.freeze({
    initial: 'Dotazione iniziale',
    harvest: "Raccolto d'apertura",
    rent: 'Rendita periodica',
    cost: 'Costo giocata',
    conversion: 'Riconversione',
    raid: 'Razzia',
  });

const OVERFLOW_REASON_LABELS_IT: Readonly<
  Record<ResourceOverflowReason, string>
> = Object.freeze({
  harvest: "Raccolto d'apertura",
  rent: 'Rendita periodica',
  conversion: 'Riconversione',
  raid: 'Razzia',
});

const PENDING_WINDOW_LABELS_IT: Readonly<Record<PendingWindow, string>> =
  Object.freeze({
    mulligan: 'il mulligan iniziale',
    hand_limit: 'lo scarto per limite di mano',
    prebattle: 'le scelte segrete di Pre-Battaglia',
  });

const PASS_REASON_LABELS_IT: Readonly<Record<PassReason, string>> =
  Object.freeze({
    chosen: 'scelta volontaria',
    no_legal_play: 'nessuna mossa legale disponibile',
    timeout: 'tempo scaduto',
  });

const BATTLE_OUTCOME_LABELS_IT: Readonly<Record<BattleOutcomeKind, string>> =
  Object.freeze({
    winner: 'vittoria campale',
    mutual_annihilation: 'annientamento reciproco',
    stalemate: 'stallo dopo 6 cicli di Mischia',
  });

const GAME_RESULT_KIND_LABELS_IT: Readonly<Record<GameResultKind, string>> =
  Object.freeze({
    annihilation: 'annientamento del Centro Città',
    points: 'vittoria ai punti a fine Era III',
    draw: 'pareggio perfetto dopo tutti gli spareggi',
    concession: 'resa avversaria',
    timeout: 'abbandono per timeout consecutivi',
  });

function resolveCardDisplayName(cardId: string | undefined): string {
  if (!cardId) {
    return 'carta coperta';
  }
  try {
    return getCard(cardId).text.name;
  } catch {
    return cardId;
  }
}

function formatResourcesDeltaIt(delta: Resources): string {
  const parts: string[] = [];
  for (const res of RESOURCE_ORDER) {
    const amount = delta[res];
    if (amount > 0) {
      parts.push(`+${amount} ${RESOURCE_NAMES_IT[res]}`);
    } else if (amount < 0) {
      parts.push(`${amount} ${RESOURCE_NAMES_IT[res]}`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : 'nessuna variazione';
}

function formatResourcesBalanceIt(resources: Resources): string {
  return `${resources.food} Cibo, ${resources.wood} Legno, ${resources.metal} Metallo`;
}

/**
 * Restituisce l'etichetta della fase di combattimento/assedio attiva per la barra EventPlayer (§9.4, §9.5),
 * oppure `null` se l'evento non appartiene alla sequenza di battaglia/assedio.
 */
export function getBattleStageLabel(
  event: GameEvent,
  _locale: SupportedLocale = 'it',
): string | null {
  switch (event.type) {
    case 'BattlePhaseResolved': {
      if (event.phase === 'phase3_melee') {
        const cycle = event.meleeCycle ?? 1;
        return `Fase 3: Mischia Ciclo ${cycle}/6`;
      }
      return BATTLE_PHASE_LABELS_IT[event.phase];
    }
    case 'SiegeResolved':
    case 'RaidResolved':
      return 'Fase 4: Assedio e Razzia';
    default:
      return null;
  }
}

/**
 * Genera la voce leggibile in italiano (sentence case) per il Registro di Battaglia e `aria-live="polite"` (§9.5).
 */
export function describeEvent(
  event: GameEvent,
  _locale: SupportedLocale = 'it',
): string {
  switch (event.type) {
    case 'GameStarted':
      return `Partita avviata in Era ${ERA_ROMAN_BY_NO[event.era]} (Regolamento v${event.rulesetVersion}).`;

    case 'InitiativeAssigned':
      return `Iniziativa dell'Era ${ERA_ROMAN_BY_NO[event.era]} assegnata a ${event.initiative}.`;

    case 'CardsDrawn': {
      const noun = event.count === 1 ? 'carta' : 'carte';
      if (event.cards && event.cards.length > 0) {
        const names = event.cards
          .map((c) => resolveCardDisplayName(c.cardId))
          .join(', ');
        return `${event.player} pesca ${event.count} ${noun} dal mazzo di Era ${ERA_ROMAN_BY_NO[event.era]} (${names}).`;
      }
      return `${event.player} pesca ${event.count} ${noun} dal mazzo di Era ${ERA_ROMAN_BY_NO[event.era]}.`;
    }

    case 'PlayerCommitted':
      return `${event.player} ha confermato ${PENDING_WINDOW_LABELS_IT[event.window]}.`;

    case 'MulliganResolved': {
      if (event.count === 0) {
        return `${event.player} mantiene la mano iniziale senza cambiare carte.`;
      }
      const noun = event.count === 1 ? 'carta' : 'carte';
      return `${event.player} sostituisce ${event.count} ${noun} nel mulligan iniziale.`;
    }

    case 'EraStarted':
      return `Inizia l'Era ${ERA_ROMAN_BY_NO[event.era]} con iniziativa a ${event.initiative} (Mura P1: ${event.walls.P1}, P2: ${event.walls.P2}; Centro Città P1: ${event.cityHp.P1}/${event.cityMax.P1}, P2: ${event.cityHp.P2}/${event.cityMax.P2}).`;

    case 'HandLimitDiscarded': {
      const noun = event.count === 1 ? 'carta' : 'carte';
      if (event.cardUids && event.cardUids.length > 0) {
        return `${event.player} scarta ${event.count} ${noun} per rispettare il limite di mano (${event.cardUids.join(', ')}).`;
      }
      return `${event.player} scarta ${event.count} ${noun} per rispettare il limite di mano.`;
    }

    case 'ResourcesChanged': {
      const reasonLabel = RESOURCE_REASON_LABELS_IT[event.reason];
      const deltaText = formatResourcesDeltaIt(event.delta);
      const balanceText = formatResourcesBalanceIt(event.resources);
      return `${event.player} — ${reasonLabel}: ${deltaText} (Saldo: ${balanceText}).`;
    }

    case 'ResourcesOverflowed': {
      const reasonLabel = OVERFLOW_REASON_LABELS_IT[event.reason];
      const overflowText = formatResourcesDeltaIt(event.overflow);
      return `${event.player} perde risorse in eccesso per cap magazzino (${event.cap}) durante ${reasonLabel}: ${overflowText}.`;
    }

    case 'CycleStarted':
      return `Era ${ERA_ROMAN_BY_NO[event.era]} · Ciclo ${event.cycle}: tocca a ${event.toAct}.`;

    case 'CardPlayed': {
      if (event.cardId !== undefined) {
        const cardName = resolveCardDisplayName(event.cardId);
        const typeLabel =
          event.cardType === 'economy' ? 'Edificio Economico' : 'Unità';
        return `${event.player} schiera coperto ${cardName} (${typeLabel}, Slot usati: ${event.slotsUsed}).`;
      }
      return `${event.player} schiera una carta coperta nella Città (Slot usati: ${event.slotsUsed}, carte coperte: ${event.coveredCount}).`;
    }

    case 'ConversionActivated': {
      const convName = resolveCardDisplayName(event.cardId);
      const sacrificePart = event.sacrificeCardId
        ? ` sacrificando ${resolveCardDisplayName(event.sacrificeCardId)}`
        : ' sacrificando un Edificio Economico';
      const gainText = formatResourcesDeltaIt(event.gain);
      const demPart =
        event.demBonusGained > 0
          ? ` e ottiene +${event.demBonusGained} DEM per l'Era III`
          : '';
      return `${event.player} attiva la Riconversione ${convName}${sacrificePart}: ${gainText}${demPart}.`;
    }

    case 'PlayerPassed':
      return `${event.player} passa il turno per il resto dell'Era ${ERA_ROMAN_BY_NO[event.era]} al Ciclo ${event.cycle} (${PASS_REASON_LABELS_IT[event.reason]}).`;

    case 'DevelopmentEnded':
      return `Termina la Fase di Sviluppo dell'Era ${ERA_ROMAN_BY_NO[event.era]}: entrambi i giocatori hanno passato.`;

    case 'UnitsRevealed': {
      const p1Units = event.units.P1;
      const p2Units = event.units.P2;
      const p1Names =
        p1Units.length > 0
          ? p1Units.map((u) => resolveCardDisplayName(u.cardId)).join(', ')
          : 'nessuna unità';
      const p2Names =
        p2Units.length > 0
          ? p2Units.map((u) => resolveCardDisplayName(u.cardId)).join(', ')
          : 'nessuna unità';
      return `Rivelazione delle Unità in Era ${ERA_ROMAN_BY_NO[event.era]}: P1 schiera ${p1Units.length} unità (${p1Names}); P2 schiera ${p2Units.length} unità (${p2Names}).`;
    }

    case 'InstantsRevealed': {
      const p1List =
        event.played.P1.length > 0
          ? event.played.P1
              .map((item) => resolveCardDisplayName(item.cardId))
              .join(', ')
          : 'nessuna';
      const p2List =
        event.played.P2.length > 0
          ? event.played.P2
              .map((item) => resolveCardDisplayName(item.cardId))
              .join(', ')
          : 'nessuna';
      return `Istantanee rivelate in Pre-Battaglia (Era ${ERA_ROMAN_BY_NO[event.era]}): P1 [${p1List}], P2 [${p2List}].`;
    }

    case 'WallsModified':
      return `Mura modificate in Pre-Battaglia (Era ${ERA_ROMAN_BY_NO[event.era]}): P1 ${event.wallsBefore.P1} -> ${event.wallsAfter.P1}, P2 ${event.wallsBefore.P2} -> ${event.wallsAfter.P2}.`;

    case 'BattleStarted':
      return `Inizia la Battaglia Campale dell'Era ${ERA_ROMAN_BY_NO[event.era]}.`;

    case 'BattlePhaseResolved': {
      const stageLabel =
        getBattleStageLabel(event) ?? BATTLE_PHASE_LABELS_IT[event.phase];
      const p1Dead = event.casualties.P1.length;
      const p2Dead = event.casualties.P2.length;
      return `${stageLabel} — Danni inflitti: P1 ${event.damageDealt.P1}, P2 ${event.damageDealt.P2} (Caduti: P1 ${p1Dead}, P2 ${p2Dead}).`;
    }

    case 'BattleOutcome': {
      if (event.kind === 'winner' && event.winner !== undefined) {
        return `Esito Battaglia Campale (Era ${ERA_ROMAN_BY_NO[event.era]}): ${BATTLE_OUTCOME_LABELS_IT.winner} di ${event.winner}.`;
      }
      return `Esito Battaglia Campale (Era ${ERA_ROMAN_BY_NO[event.era]}): ${BATTLE_OUTCOME_LABELS_IT[event.kind]} (nessun vincitore campale).`;
    }

    case 'SiegeResolved': {
      const breachText = event.breach
        ? 'Breccia aperta nelle Mura!'
        : 'Le Mura assorbono l\'impatto.';
      return `Fase 4: Assedio e Razzia — ${event.attacker} colpisce ${event.defender} con DEM ${event.D} contro Mura ${event.W}: ${breachText} Mura residue: ${event.wallsAfter}, danno al Centro Città: ${event.directDamage} (HP residui: ${event.cityHpAfter}).`;
    }

    case 'RaidResolved':
      return `Fase 4: Assedio e Razzia — ${event.attacker} razzia ${event.defender} sottraendo ${event.foodTransferred} Cibo e ${event.woodTransferred} Legno.`;

    case 'EraEnded':
      return `Termina l'Era ${ERA_ROMAN_BY_NO[event.era]}: unità superstiti ritirate negli scarti (P1: ${event.discardedUnitUids.P1.length}, P2: ${event.discardedUnitUids.P2.length}).`;

    case 'GameEnded': {
      const reasonText = GAME_RESULT_KIND_LABELS_IT[event.kind];
      if (event.winner === 'DRAW') {
        return `Partita conclusa in pareggio (${reasonText}).`;
      }
      return `Partita conclusa: vittoria di ${event.winner} per ${reasonText}.`;
    }
  }
}
