import type { ActionSpaceState } from "./ActionSpaceState";
import type { CardState } from "./CardState";
import type { FarmAnimalType } from "./FarmState";
import type { PlayerState } from "./PlayerState";

export interface HarvestCropSummary {
  grain: number;
  vegetable: number;
}

export interface HarvestFieldState {
  round: number;
  submittedPlayerIds: string[];
  harvestedByPlayerId: Record<string, HarvestCropSummary>;
}

export interface HarvestFeedingState {
  round: number;
  submittedPlayerIds: string[];
}

export interface HarvestBreedingState {
  round: number;
  submittedPlayerIds: string[];
  pendingPlayerIds: string[];
  birthsByPlayerId: Record<string, Partial<Record<FarmAnimalType, number>>>;
  overflowByPlayerId: Record<string, Partial<Record<FarmAnimalType, number>>>;
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
  harvestField: HarvestFieldState | null;
  harvestFeeding: HarvestFeedingState | null;
  harvestBreeding: HarvestBreedingState | null;
  currentPlayerIndex: number;
  actionLog: string[];
  winnerIds: string[];
  lastError: string | null;
}
