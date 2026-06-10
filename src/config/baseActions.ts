import type { ActionSpaceState } from "../state/ActionSpaceState";

export type ResourceKey = "wood" | "clay" | "reed" | "stone" | "grain" | "vegetable" | "food";
export type AnimalKey = "sheep" | "boar" | "cattle";
export type CropKey = "grain" | "vegetable";

export type ActionEffect =
  | { type: "takeAccumulated" }
  | { type: "gainResource"; resource: ResourceKey; amount: number }
  | { type: "gainAnimal"; animal: AnimalKey; amount: number }
  | { type: "plowField" }
  | { type: "buildRooms" }
  | { type: "buildStables"; max: number; woodCost: number }
  | { type: "buildFences" }
  | { type: "sow" }
  | { type: "bakeBread" }
  | { type: "buyMajorImprovement" }
  | { type: "playOccupationPlaceholder" }
  | { type: "playMinorImprovementPlaceholder" }
  | { type: "takeStartingPlayer" }
  | { type: "renovate"; allowMajorImprovement: boolean }
  | { type: "familyGrowth"; requiresRoom: boolean; minimumRound?: number }
  | { type: "chooseOne"; effects: ActionEffect[] }
  | { type: "chooseAny"; effects: ActionEffect[] }
  | { type: "gainMissingAnimal" }
  | { type: "buildingSupplies" }
  | { type: "farmingSupplies" }
  | { type: "sideJob" };

export type ActionDefinition = Omit<ActionSpaceState, "accumulated"> & {
  playerCounts: number[];
  replenish: Record<string, number>;
  season?: number;
};

const allPlayerCounts = [1, 2, 3, 4, 5, 6];

export const baseActions: ActionDefinition[] = [
  {
    id: "forest",
    name: "森林",
    type: "accumulation",
    cost: {},
    gain: { wood: 3 },
    prerequisites: [],
    rules: ["每轮补充3木材", "获得该格上全部木材"],
    restrictions: [],
    occupiedBy: null,
    effects: [{ type: "takeAccumulated" }],
    playerCounts: allPlayerCounts,
    replenish: { wood: 3 },
  },
  {
    id: "clay-pit",
    name: "黏土坑",
    type: "accumulation",
    cost: {},
    gain: { clay: 1 },
    prerequisites: [],
    rules: ["每轮补充1黏土", "获得全部黏土"],
    restrictions: [],
    occupiedBy: null,
    effects: [{ type: "takeAccumulated" }],
    playerCounts: allPlayerCounts,
    replenish: { clay: 1 },
  },
  {
    id: "reed-bank",
    name: "芦苇滩",
    type: "accumulation",
    cost: {},
    gain: { reed: 1 },
    prerequisites: [],
    rules: ["每轮补充1芦苇", "获得全部芦苇"],
    restrictions: [],
    occupiedBy: null,
    effects: [{ type: "takeAccumulated" }],
    playerCounts: allPlayerCounts,
    replenish: { reed: 1 },
  },
  {
    id: "fishing",
    name: "捕鱼",
    type: "accumulation",
    cost: {},
    gain: { food: 1 },
    prerequisites: [],
    rules: ["每轮补充1食物", "获得全部食物"],
    restrictions: [],
    occupiedBy: null,
    effects: [{ type: "takeAccumulated" }],
    playerCounts: allPlayerCounts,
    replenish: { food: 1 },
  },
  {
    id: "day-laborer",
    name: "打零工",
    type: "instant",
    cost: {},
    gain: { food: 2 },
    prerequisites: [],
    rules: ["获得2食物"],
    restrictions: [],
    occupiedBy: null,
    effects: [{ type: "gainResource", resource: "food", amount: 2 }],
    playerCounts: allPlayerCounts,
    replenish: {},
  },
  {
    id: "farmland",
    name: "农田",
    type: "instant",
    cost: {},
    gain: {},
    prerequisites: [],
    rules: ["翻耕1块田地", "第一块田没有相邻要求", "之后必须与已有田地正交相邻"],
    restrictions: [],
    occupiedBy: null,
    effects: [{ type: "plowField" }],
    playerCounts: allPlayerCounts,
    replenish: {},
  },
  {
    id: "grain-seeds",
    name: "谷物种子",
    type: "instant",
    cost: {},
    gain: { grain: 1 },
    prerequisites: [],
    rules: ["获得1谷物"],
    restrictions: [],
    occupiedBy: null,
    effects: [{ type: "gainResource", resource: "grain", amount: 1 }],
    playerCounts: allPlayerCounts,
    replenish: {},
  },
  {
    id: "farm-expansion",
    name: "农场扩建",
    type: "choice",
    cost: {},
    gain: {},
    prerequisites: [],
    rules: ["建房间", "建畜棚", "可任选其一或同时执行"],
    restrictions: [],
    occupiedBy: null,
    effects: [
      {
        type: "chooseAny",
        effects: [
          { type: "buildRooms" },
          { type: "buildStables", max: 4, woodCost: 2 },
        ],
      },
    ],
    playerCounts: allPlayerCounts,
    replenish: {},
  },
  {
    id: "lessons",
    name: "课程",
    type: "placeholder",
    cost: {},
    gain: {},
    prerequisites: [],
    rules: ["打出职业卡"],
    restrictions: ["职业卡内容未来开放"],
    occupiedBy: null,
    effects: [{ type: "playOccupationPlaceholder" }],
    playerCounts: allPlayerCounts,
    replenish: {},
  },
  {
    id: "meeting-place",
    name: "广场",
    type: "choice",
    cost: {},
    gain: { grain: 1 },
    prerequisites: [],
    rules: ["可获得起始玩家标记", "可获得一个粮食", "也可两种都执行"],
    restrictions: [],
    occupiedBy: null,
    effects: [
      {
        type: "chooseAny",
        effects: [
          { type: "takeStartingPlayer" },
          { type: "gainResource", resource: "grain", amount: 1 },
        ],
      },
    ],
    playerCounts: allPlayerCounts,
    replenish: {},
  },
];
