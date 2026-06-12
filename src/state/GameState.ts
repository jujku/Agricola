import type { ActionSpaceState } from "./ActionSpaceState";
import type { CardState } from "./CardState";
import type { PlayerState } from "./PlayerState";

export interface HarvestFeedingState {
  round: number;
  submittedPlayerIds: string[];
}

export type GamePhase =
  | "WAITING"
  | "SETUP"
  | "ROUND_PREPARE"
  | "WORK_PHASE"
  | "RETURN_HOME"
  | "HARVEST"
  | "NEXT_ROUND"
  | "GAME_END";

export interface GameState {
  gameId: string;
  phase: GamePhase;
  round: number;
  stage: string;
  players: PlayerState[];
  actionSpaces: ActionSpaceState[];
  roundCards: CardState[];
  currentPlayer: string | null;
  startingPlayer: string | null;
  roundDeck: CardState[];
  majorImprovements: CardState[];
  harvestFeeding: HarvestFeedingState | null;
  currentPlayerIndex: number;
  actionLog: string[];
  winnerIds: string[];
  lastError: string | null;
}
