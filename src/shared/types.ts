import type { GameState } from "../state/GameState";
import type { FarmAnimalType, FenceEdge, FenceSegment } from "../state/FarmState";

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
  enableCardDraft?: boolean;
  roomPassword?: string;
  draftTimeLimitMinutes?: number | null;
}

export interface JoinRoomPayload {
  roomId: string;
  playerName: string;
  roomPassword?: string;
}

export interface StartGamePayload {
  roomId: string;
}

export interface AddComputerPlayerPayload {
  roomId: string;
}

export interface SetPlayerReadyPayload {
  roomId: string;
  playerId: string;
  ready: boolean;
}

export interface ConfirmGameEndPayload {
  roomId: string;
  playerId: string;
}

export interface SubmitCardDraftPickPayload {
  roomId: string;
  playerId: string;
  minorImprovementId: string;
  occupationId: string;
}

export interface SubmitCardChoicePayload {
  roomId: string;
  playerId: string;
  input?: ActionInput;
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

export interface SubmitHarvestFieldPayload {
  roomId: string;
  playerId: string;
}

export interface SubmitHarvestFeedingPayload {
  roomId: string;
  playerId: string;
  grainToFood: number;
  vegetableToFood: number;
  cookedAnimals?: AnimalCookInput[];
  cookedItems?: CookInput[];
  harvestConversions?: HarvestConversionInput[];
}

export interface SubmitHarvestBreedingPayload {
  roomId: string;
  playerId: string;
  resolution: AnimalOverflowResolution;
}

export interface CookWithMajorImprovementPayload {
  roomId: string;
  playerId: string;
  improvementId: string;
  cookedAnimals: AnimalCookInput[];
  cookedItems?: CookInput[];
}

export interface AdminRoomPayload {
  roomId: string;
}

export interface AdminAdjustResourcePayload {
  roomId: string;
  playerId: string;
  key: "wood" | "clay" | "reed" | "stone" | "grain" | "vegetable" | "food" | "sheep" | "boar" | "cattle" | "begging";
  delta: number;
}

export interface AdminAddCardToHandPayload {
  roomId: string;
  playerId: string;
  kind: "minor" | "occupation";
  cardId: string;
}

export interface AdminToggleActionSpaceOccupiedPayload {
  roomId: string;
  actionSpaceId: string;
}

export interface ActionNotice {
  message: string;
}

export interface RoomListItem {
  roomId: string;
  phase: GameState["phase"];
  round: number;
  enableCardDraft?: boolean;
  hasRoomPassword?: boolean;
  draftTimeLimitMinutes?: number | null;
  isTestRoom?: boolean;
  players: Array<{
    id: string;
    name: string;
    isComputer?: boolean;
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

export interface AnimalPlacementInput {
  animal: FarmAnimalType;
  placements: Array<
    | { type: "house"; count: number }
    | { type: "stable"; row: number; col: number; count: number; animal?: FarmAnimalType }
    | { type: "pasture"; pastureId: string; row: number; col: number; count: number; animal?: FarmAnimalType }
  >;
  cooked?: number;
  cookImprovementId?: string;
  discarded?: number;
}

export interface AnimalCookInput {
  animal: FarmAnimalType;
  count: number;
}

export interface CookInput {
  from: "vegetable" | FarmAnimalType;
  count: number;
}

export interface HarvestConversionInput {
  improvementId: string;
  conversionId?: string;
  count: number;
}

export interface AnimalOverflowResolution {
  placements: AnimalPlacementInput["placements"];
  cooked: AnimalCookInput[];
  discarded: Array<{ animal: FarmAnimalType; count: number }>;
}

export interface ActionInput {
  selectedEffectTypes?: string[];
  selectedEffectIds?: string[];
  fieldCell?: CellPosition;
  roomCells?: CellPosition[];
  stableCells?: CellPosition[];
  pastureCells?: CellPosition[];
  fenceEdges?: FenceEdge[];
  fenceSegments?: FenceSegment[];
  overflowAnimalResolution?: AnimalOverflowResolution;
  sow?: SowInput[];
  majorImprovementId?: string;
  occupationCardId?: string;
  minorImprovementCardId?: string;
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
  animalPlacement?: AnimalPlacementInput;
  resourceChoices?: {
    first?: "reed" | "stone";
    second?: "wood" | "clay";
  };
  farmingSupplies?: {
    grainTrades?: number;
    fieldTrades?: CellPosition[];
  };
  useCardActionAccess?: boolean;
  usePendingActionAccess?: boolean;
}
