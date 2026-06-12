import type { GameState } from "../state/GameState";

export interface RoomSnapshot {
  roomId: string;
  game: GameState;
}

export interface AuthPayload {
  username: string;
  password: string;
}

export interface RestoreSessionPayload {
  token: string;
}

export interface AuthSuccessPayload {
  username: string;
  token: string;
}

export interface CreateRoomPayload {
  playerName: string;
}

export interface JoinRoomPayload {
  roomId: string;
  playerName: string;
}

export interface StartGamePayload {
  roomId: string;
}

export interface LeaveRoomPayload {
  roomId: string;
}

export interface RoomLeftPayload {
  roomId: string;
  message: string;
}

export interface PlaceWorkerPayload {
  roomId: string;
  playerId: string;
  workerId: string;
  actionSpaceId: string;
  input?: ActionInput;
}

export interface CardActionPayload {
  roomId: string;
  playerId: string;
  input?: ActionInput;
}

export interface SubmitHarvestFeedingPayload {
  roomId: string;
  playerId: string;
  grainToFood: number;
  vegetableToFood: number;
}

export interface ActionNotice {
  message: string;
}

export interface RoomListItem {
  roomId: string;
  phase: GameState["phase"];
  round: number;
  players: Array<{
    id: string;
    name: string;
  }>;
}

export interface CellPosition {
  row: number;
  col: number;
}

export interface SowInput {
  crop: "grain" | "vegetable";
  cells: CellPosition[];
}

export interface ActionInput {
  selectedEffectTypes?: string[];
  fieldCell?: CellPosition;
  roomCells?: CellPosition[];
  stableCells?: CellPosition[];
  pastureCells?: CellPosition[];
  sow?: SowInput[];
  majorImprovementId?: string;
  upgradeFromId?: string;
  bake?: {
    improvementId: string;
    grain: number;
  };
  cook?: Array<{
    improvementId: string;
    from: "vegetable" | "sheep" | "boar" | "cattle";
    amount: number;
  }>;
  animalChoice?: "sheep" | "boar" | "cattle";
  resourceChoices?: {
    first?: "reed" | "stone";
    second?: "wood" | "clay";
  };
  farmingSupplies?: {
    grainTrades?: number;
    fieldTrades?: CellPosition[];
  };
}
