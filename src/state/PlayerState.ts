import type { FarmState } from "./FarmState";

export interface ResourceState {
  wood: number;
  clay: number;
  reed: number;
  stone: number;
  grain: number;
  vegetable: number;
  food: number;
}

export interface AnimalState {
  sheep: number;
  boar: number;
  cattle: number;
}

export interface WorkerState {
  id: string;
  location: "home" | "action_space";
  actionSpaceId: string | null;
  availableRound: number;
}

export interface PendingFood {
  round: number;
  amount: number;
}

export interface PendingGood {
  round: number;
  sourceCardId?: string;
  resources?: Partial<ResourceState>;
  animals?: Partial<AnimalState>;
}

export interface PlayedCardRuntimeState {
  cardId: string;
  playedRound: number;
  markers: Record<string, number>;
  storedAnimals: Partial<AnimalState>;
  storedGoods: Partial<ResourceState>;
  bonusPoints: number;
  flipped?: boolean;
}

export interface ScoreBreakdown {
  fields: number;
  pastures: number;
  grain: number;
  vegetables: number;
  sheep: number;
  boar: number;
  cattle: number;
  rooms: number;
  family: number;
  fencedStables: number;
  majorImprovements: number;
  minorImprovements: number;
  occupations: number;
  emptySpaces: number;
  beggingCards: number;
  bonusPoints: number;
  total: number;
}

export interface PlayerState {
  id: string;
  name: string;
  isComputer?: boolean;
  resources: ResourceState;
  animals: AnimalState;
  workers: WorkerState[];
  occupationHand: string[];
  minorImprovementHand: string[];
  occupations: string[];
  minorImprovements: string[];
  majorImprovements: string[];
  farm: FarmState;
  beggingCards: number;
  pendingFood: PendingFood[];
  pendingGoods: PendingGood[];
  cardStates: Record<string, PlayedCardRuntimeState>;
  score: ScoreBreakdown | null;
}
