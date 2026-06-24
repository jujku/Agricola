import type { ActionSpaceState } from "./ActionSpaceState";
import type { AnimalKey, ResourceKey } from "../config/baseActions";
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

export interface PendingActionAccessState {
  playerId: string;
  access: "keepTurnAfterAnyAction" | "keepTurnAfterAnimalMarket";
  sourceCardId: string | null;
  createdRound: number;
  used: boolean;
}

export interface PendingCardChoiceState {
  id: string;
  playerId: string;
  cardId: string;
  label: string;
  type: "gainAnimals" | "plowField" | "buildStable" | "buildRoomOrRenovate";
  animals?: Partial<Record<AnimalKey, number>>;
  resources?: Partial<Record<ResourceKey, number>>;
  cost?: Partial<Record<ResourceKey, number>>;
  removeWorkers?: number;
  storeOnCard?: boolean;
  plowAmount?: number;
  stableAmount?: number;
  consumeMarker?: string;
  createdRound: number;
  remainingChoices?: PendingCardChoiceState[];
}

export interface GameOptionsState {
  enableCardDraft: boolean;
  draftTimeLimitMinutes: number | null;
}

export interface CardDraftPackState {
  playerId: string;
  minorImprovementIds: string[];
  occupationIds: string[];
}

export interface CardDraftSelectionState {
  minorImprovementId: string;
  occupationId: string;
}

export interface CardDraftState {
  round: number;
  picksPerPlayer: number;
  direction: "left";
  packs: CardDraftPackState[];
  pendingSelections: Record<string, CardDraftSelectionState>;
}

export type GamePhase =
  | "WAITING"
  | "SETUP"
  | "CARD_DRAFT"
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
  options: GameOptionsState;
  hostPlayerId: string | null;
  readyPlayerIds: string[];
  gameEndConfirmedPlayerIds: string[];
  players: PlayerState[];
  actionSpaces: ActionSpaceState[];
  roundCards: CardState[];
  currentPlayer: string | null;
  startingPlayer: string | null;
  pendingActionAccess: PendingActionAccessState | null;
  pendingCardChoice: PendingCardChoiceState | null;
  workPhaseActionCount: number;
  lastActionOrdinalByPlayerId: Record<string, number>;
  roundDeck: CardState[];
  occupationDeck: string[];
  minorImprovementDeck: string[];
  majorImprovements: CardState[];
  harvestField: HarvestFieldState | null;
  harvestFeeding: HarvestFeedingState | null;
  harvestBreeding: HarvestBreedingState | null;
  cardDraft: CardDraftState | null;
  currentPlayerIndex: number;
  actionLog: string[];
  winnerIds: string[];
  lastError: string | null;
}
