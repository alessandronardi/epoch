import type { ClientCommand, PlayerView, Result, RuleError } from '@epochs/engine';
import type { GameController } from '../controllers/types.js';
import type { GameStoreApi } from '../state/game-store.js';
import type { TutorialCue } from './tutorial-scenario.js';

/** Verifica il comando ricevuto dalla UI; non costruisce comandi per il giocatore. */
export function matchesTutorialCommand(
  cue: TutorialCue,
  command: ClientCommand,
  view: PlayerView,
): boolean {
  if (
    (cue.viewer !== undefined && view.me !== cue.viewer) ||
    view.era !== cue.era ||
    view.phase !== cue.phase
  )
    return false;
  const action = cue.action;
  const cardId = (uid: string): string | undefined =>
    view.self.hand.find((card) => card.uid === uid)?.cardId;
  const matchesIds = (uids: readonly string[], ids: readonly string[]): boolean =>
    new Set(uids).size === uids.length &&
    uids.length === ids.length &&
    [...uids.map(cardId)].sort().join('|') === [...ids].sort().join('|');
  switch (action.kind) {
    case 'mulligan':
      return command.type === 'SubmitMulligan' && matchesIds(command.cardUids, [action.cardId]);
    case 'concede':
      return command.type === 'Concede';
    case 'keep':
      return command.type === 'SubmitMulligan' && command.cardUids.length === 0;
    case 'discard':
      return (
        command.type === 'SubmitDiscard' &&
        command.cardUids.length === view.self.legal.mustDiscardCount
      );
    case 'play':
      return command.type === 'PlayCard' && cardId(command.cardUid) === action.cardId;
    case 'conversion':
      return (
        command.type === 'PlayConversion' &&
        cardId(command.cardUid) === action.cardId &&
        view.self.buildings.some(
          (card) => card.uid === command.sacrificeUid && card.cardId === action.sacrificeId,
        )
      );
    case 'pass':
      return command.type === 'Pass';
    case 'instants':
      return command.type === 'LockInstants' && matchesIds(command.cardUids, action.cardIds);
    default:
      return false;
  }
}

export function createTutorialAdapter({
  controller,
  store,
  getCue,
  isPending,
  onAccepted,
  onError,
  onHandover,
}: {
  readonly controller: GameController;
  readonly store: GameStoreApi;
  readonly getCue: () => TutorialCue;
  readonly isPending: () => boolean;
  readonly onAccepted: (view: PlayerView) => void;
  readonly onError: (message: string) => void;
  readonly onHandover?: (() => void) | undefined;
}): GameController {
  const dispatch = (command: ClientCommand): Result<PlayerView, RuleError> => {
    const state = store.getState();
    const cue = getCue();
    if (
      state.isPlaying ||
      state.awaitingHotSeatHandover ||
      isPending() ||
      state.view === null ||
      !matchesTutorialCommand(cue, command, state.view)
    ) {
      const message =
        state.isPlaying || isPending()
          ? 'Attendi il completamento degli eventi sul tavolo.'
          : `Obiettivo attuale: ${cue.label}. Puoi annullare la scelta e riprovare.`;
      onError(message);
      return { ok: false, error: { code: 'INVALID_PHASE', message } };
    }
    const result = controller.dispatch(command);
    if (result.ok) onAccepted(result.value);
    else onError(result.error.message);
    return result;
  };
  return {
    mode: controller.mode,
    startMatch: () => controller.startMatch(),
    dispatch,
    concede: () => dispatch({ type: 'Concede' }),
    acknowledgeHotSeatHandover: () => {
      const state = store.getState();
      const cue = getCue();
      if (
        state.isPlaying ||
        !state.awaitingHotSeatHandover ||
        cue.action.kind !== 'handover' ||
        cue.viewer !== state.view?.me
      )
        return;
      controller.acknowledgeHotSeatHandover();
      onHandover?.();
    },
    getCurrentViewer: () => controller.getCurrentViewer(),
    getPlayerView: () => controller.getPlayerView(),
    dispose: () => controller.dispose(),
  };
}
