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
  resources: ResourceState;
  animals: AnimalState;
  workers: WorkerState[];
  occupations: string[];
  minorImprovements: string[];
  majorImprovements: string[];
  farm: FarmState;
  beggingCards: number;
  pendingFood: PendingFood[];
  score: ScoreBreakdown | null;
}
