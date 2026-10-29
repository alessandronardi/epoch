import { CARDS_RULES } from '@epochs/content';
import { autoDiscard, type ClientCommand, type PlayerView } from '@epochs/engine';
import type { TutorialCue } from '../src/tutorial/tutorial-scenario.js';

// Fixture per i soli test del motore; i test UI eseguono ogni azione sui componenti.
/** Risolve gli UID dalla vista corrente e impedisce di saltare una precondizione. */
export function resolveTutorialCommand(cue: TutorialCue, view: PlayerView): ClientCommand | null {
  if (view.era !== cue.era || view.phase !== cue.phase) {
    throw new Error('La partita non è nella fase prevista. Riavvia il tutorial.');
  }
  const action = cue.action;
  const legal = view.self.legal;
  const handUid = (id: string): string => {
    const card = view.self.hand.find((item) => item.cardId === id);
    if (!card) throw new Error('La carta guidata non è disponibile. Riavvia il tutorial.');
    return card.uid;
  };
  const requireLegal = (condition: boolean): void => {
    if (!condition) throw new Error('L’azione guidata non è disponibile. Riavvia il tutorial.');
  };
  switch (action.kind) {
    case 'instant-budget':
    case 'handover':
    case 'read':
    case 'inspect':
    case 'deselect':
    case 'unplayable':
    case 'cancel-pass':
    case 'cancel-conversion':
    case 'log':
      return null;
    case 'concede':
      return { type: 'Concede' };
    case 'timeout':
      return { type: 'ApplyTimeout' };
    case 'keep':
      return { type: 'SubmitMulligan', cardUids: [] };
    case 'discard':
      return {
        type: 'SubmitDiscard',
        cardUids: autoDiscard(view.self.hand, CARDS_RULES, legal.mustDiscardCount),
      };
    case 'mulligan':
      requireLegal(legal.canSubmitMulligan);
      return { type: 'SubmitMulligan', cardUids: [handUid(action.cardId)] };
    case 'play': {
      const uid = handUid(action.cardId);
      requireLegal(legal.canAct && legal.playableFieldCardUids.includes(uid));
      return { type: 'PlayCard', cardUid: uid };
    }
    case 'conversion': {
      const uid = handUid(action.cardId);
      const building = view.self.buildings.find((item) => item.cardId === action.sacrificeId);
      requireLegal(legal.canAct && legal.playableConversionUids.includes(uid));
      if (!building || !legal.sacrificableBuildingUids.includes(building.uid)) {
        throw new Error('L’edificio da riconvertire non è disponibile. Riavvia il tutorial.');
      }
      return { type: 'PlayConversion', cardUid: uid, sacrificeUid: building.uid };
    }
    case 'pass':
      requireLegal(legal.canPass);
      return { type: 'Pass' };
    case 'instants': {
      const uids = action.cardIds.map(handUid);
      requireLegal(
        legal.canLockInstants && uids.every((uid) => legal.playableInstantUids.includes(uid)),
      );
      return { type: 'LockInstants', cardUids: uids };
    }
  }
}
