import type { Bot, BotKind } from '@epochs/bots';
import type {
  CardRules,
  ClientCommand,
  DeckPayload,
  EraNo,
  GameEvent,
  PlayerId,
  PlayerView,
  Result,
  RuleError,
  RulesConfig,
} from '@epochs/engine';
import type { GameStoreApi } from '../state/game-store.js';

export type ControllerMode = 'bot' | 'hotseat' | 'remote' | 'replay';

export interface ProjectionNotification {
  readonly viewer: PlayerId;
  readonly view: PlayerView;
  readonly events: readonly GameEvent[];
}

/**
 * Interfaccia unificata di controllo partita per la UI (§9.8).
 * La UI interagisce esclusivamente con `GameController` e riceve solo `PlayerView` ed eventi proiettati.
 */
export interface GameController {
  readonly mode: ControllerMode;
  startMatch(): PlayerView;
  dispatch(command: ClientCommand): Result<PlayerView, RuleError>;
  concede(player?: PlayerId): Result<PlayerView, RuleError>;
  acknowledgeHotSeatHandover(): void;
  getCurrentViewer(): PlayerId;
  getPlayerView(): PlayerView | null;
  dispose(): void;
}

export interface LocalGameControllerOptions {
  readonly mode: 'bot' | 'hotseat';
  readonly seed: string;
  readonly catalog?: Readonly<Record<string, CardRules>> | undefined;
  readonly decks?: Readonly<Record<PlayerId, DeckPayload>> | undefined;
  readonly fixedDecks?:
    | Readonly<Record<PlayerId, Record<EraNo, string[]>>>
    | undefined;
  readonly fixedInitiative?: PlayerId | undefined;
  readonly rules?: Partial<RulesConfig> | undefined;
  readonly humanPlayer?: PlayerId | undefined;
  readonly bot?: Bot | undefined;
  readonly botKind?: BotKind | undefined;
  readonly store?: GameStoreApi | undefined;
  readonly onProjectionEmitted?:
    | ((notification: ProjectionNotification) => void)
    | undefined;
}
