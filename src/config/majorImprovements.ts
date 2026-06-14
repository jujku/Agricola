import type { ResourceKey, AnimalKey } from "./baseActions";
import type { Trigger } from "../engine/EventBus";

export interface MajorImprovementDefinition {
  id: string;
  name: string;
  cost: Record<string, number>;
  upgradeFrom?: string[];
  victoryPoints: number;
  triggers: Trigger[];
  effects: Array<
    | { type: "cook"; from: ResourceKey | AnimalKey; toFood: number }
    | { type: "bakeBread"; grainLimit: number | null; foodPerGrain: number }
    | { type: "harvestConvert"; resource: ResourceKey; amount: number; food: number }
    | { type: "gameEndResourceBonus"; resource: ResourceKey; ranges: Array<{ min: number; max: number | null; points: number }> }
    | { type: "wellFood"; rounds: number; foodPerRound: number }
  >;
}

export const majorImprovements: MajorImprovementDefinition[] = [
  {
    id: "fireplace-a",
    name: "篝火一",
    cost: { clay: 2 },
    victoryPoints: 1,
    triggers: ["ON_COOK", "ON_BAKE_BREAD"],
    effects: [
      { type: "cook", from: "vegetable", toFood: 2 },
      { type: "cook", from: "sheep", toFood: 2 },
      { type: "cook", from: "boar", toFood: 2 },
      { type: "cook", from: "cattle", toFood: 3 },
      { type: "bakeBread", grainLimit: 1, foodPerGrain: 2 },
    ],
  },
  {
    id: "fireplace-b",
    name: "篝火二",
    cost: { clay: 3 },
    victoryPoints: 1,
    triggers: ["ON_COOK", "ON_BAKE_BREAD"],
    effects: [
      { type: "cook", from: "vegetable", toFood: 2 },
      { type: "cook", from: "sheep", toFood: 2 },
      { type: "cook", from: "boar", toFood: 2 },
      { type: "cook", from: "cattle", toFood: 3 },
      { type: "bakeBread", grainLimit: 1, foodPerGrain: 2 },
    ],
  },
  {
    id: "cooking-hearth-a",
    name: "灶台一",
    cost: { clay: 4 },
    upgradeFrom: ["fireplace-a", "fireplace-b"],
    victoryPoints: 1,
    triggers: ["ON_COOK", "ON_BAKE_BREAD"],
    effects: [
      { type: "cook", from: "vegetable", toFood: 3 },
      { type: "cook", from: "sheep", toFood: 2 },
      { type: "cook", from: "boar", toFood: 3 },
      { type: "cook", from: "cattle", toFood: 4 },
      { type: "bakeBread", grainLimit: 1, foodPerGrain: 3 },
    ],
  },
  {
    id: "cooking-hearth-b",
    name: "灶台二",
    cost: { clay: 5 },
    upgradeFrom: ["fireplace-a", "fireplace-b"],
    victoryPoints: 1,
    triggers: ["ON_COOK", "ON_BAKE_BREAD"],
    effects: [
      { type: "cook", from: "vegetable", toFood: 3 },
      { type: "cook", from: "sheep", toFood: 2 },
      { type: "cook", from: "boar", toFood: 3 },
      { type: "cook", from: "cattle", toFood: 4 },
      { type: "bakeBread", grainLimit: 1, foodPerGrain: 3 },
    ],
  },
  {
    id: "clay-oven",
    name: "陶土烤炉",
    cost: { clay: 3, stone: 1 },
    victoryPoints: 2,
    triggers: ["ON_BUILD", "ON_BAKE_BREAD"],
    effects: [{ type: "bakeBread", grainLimit: 1, foodPerGrain: 5 }],
  },
  {
    id: "stone-oven",
    name: "石头烤炉",
    cost: { clay: 1, stone: 3 },
    victoryPoints: 3,
    triggers: ["ON_BUILD", "ON_BAKE_BREAD"],
    effects: [{ type: "bakeBread", grainLimit: 2, foodPerGrain: 4 }],
  },
  {
    id: "joinery",
    name: "木工坊",
    cost: { wood: 2, stone: 2 },
    victoryPoints: 2,
    triggers: ["ON_HARVEST", "ON_GAME_END"],
    effects: [
      { type: "harvestConvert", resource: "wood", amount: 1, food: 2 },
      {
        type: "gameEndResourceBonus",
        resource: "wood",
        ranges: [
          { min: 0, max: 2, points: 0 },
          { min: 3, max: 4, points: 1 },
          { min: 5, max: 6, points: 2 },
          { min: 7, max: null, points: 3 },
        ],
      },
    ],
  },
  {
    id: "pottery",
    name: "陶器坊",
    cost: { clay: 2, stone: 2 },
    victoryPoints: 2,
    triggers: ["ON_HARVEST", "ON_GAME_END"],
    effects: [
      { type: "harvestConvert", resource: "clay", amount: 1, food: 2 },
      {
        type: "gameEndResourceBonus",
        resource: "clay",
        ranges: [
          { min: 0, max: 2, points: 0 },
          { min: 3, max: 4, points: 1 },
          { min: 5, max: 6, points: 2 },
          { min: 7, max: null, points: 3 },
        ],
      },
    ],
  },
  {
    id: "basketmaker-workshop",
    name: "编织工坊",
    cost: { reed: 2, stone: 2 },
    victoryPoints: 2,
    triggers: ["ON_HARVEST", "ON_GAME_END"],
    effects: [
      { type: "harvestConvert", resource: "reed", amount: 1, food: 3 },
      {
        type: "gameEndResourceBonus",
        resource: "reed",
        ranges: [
          { min: 0, max: 1, points: 0 },
          { min: 2, max: 3, points: 1 },
          { min: 4, max: 5, points: 2 },
          { min: 6, max: null, points: 3 },
        ],
      },
    ],
  },
  {
    id: "well",
    name: "水井",
    cost: { wood: 1, stone: 3 },
    victoryPoints: 4,
    triggers: ["ON_BUILD", "ON_ROUND_START"],
    effects: [{ type: "wellFood", rounds: 5, foodPerRound: 1 }],
  },
];
