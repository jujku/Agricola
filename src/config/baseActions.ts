import type { ActionSpaceState } from "../state/ActionSpaceState";

export type ResourceKey = "wood" | "clay" | "reed" | "stone" | "grain" | "vegetable" | "food";
export type AnimalKey = "sheep" | "boar" | "cattle";
export type CropKey = "grain" | "vegetable";

export type ActionEffectMeta = {
  id?: string;
  label?: string;
  description?: string;
  requiresSelectedEffectTypes?: string[];
};

export type ActionEffect =
  | (ActionEffectMeta & { type: "takeAccumulated" })
  | (ActionEffectMeta & { type: "gainResource"; resource: ResourceKey; amount: number })
  | (ActionEffectMeta & { type: "gainAnimal"; animal: AnimalKey; amount: number; foodDelta?: number })
  | (ActionEffectMeta & { type: "plowField" })
  | (ActionEffectMeta & { type: "buildRooms" })
  | (ActionEffectMeta & { type: "buildStables"; max: number; woodCost: number })
  | (ActionEffectMeta & { type: "buildFences" })
  | (ActionEffectMeta & { type: "sow" })
  | (ActionEffectMeta & { type: "bakeBread" })
  | (ActionEffectMeta & { type: "buyMajorImprovement"; minimumRound?: number })
  | (ActionEffectMeta & { type: "playOccupationPlaceholder" })
  | (ActionEffectMeta & { type: "playMinorImprovementPlaceholder" })
  | (ActionEffectMeta & { type: "takeStartingPlayer" })
  | (ActionEffectMeta & { type: "renovate"; allowMajorImprovement: boolean })
  | (ActionEffectMeta & { type: "familyGrowth"; requiresRoom: boolean; minimumRound?: number })
  | (ActionEffectMeta & { type: "chooseOne"; effects: ActionEffect[] })
  | (ActionEffectMeta & { type: "chooseAny"; effects: ActionEffect[] })
  | (ActionEffectMeta & { type: "gainMissingAnimal" })
  | (ActionEffectMeta & { type: "buildingSupplies"; resources?: Partial<Record<ResourceKey, number>> })
  | (ActionEffectMeta & { type: "farmingSupplies" })
  | (ActionEffectMeta & { type: "sideJob" });

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
          {
            type: "buildRooms",
            label: "建房间",
            description: "新房间必须与已有房间正交相邻；一次可建多个，材料按房间数量支付。",
          },
          {
            type: "buildStables",
            label: "建马厩",
            description: "每个马厩消耗2木材；一次最多建4个，每格最多1个。",
            max: 4,
            woodCost: 2,
          },
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
    gain: {},
    prerequisites: [],
    rules: ["可获得起始玩家标记。", "可打出1张职业卡并支付食物。", "也可两者都执行。"],
    restrictions: ["职业卡内容未来开放"],
    occupiedBy: null,
    effects: [
      {
        type: "chooseAny",
        effects: [
          { type: "takeStartingPlayer", label: "拿起始玩家", description: "获得起始玩家标记，下回合优先行动。" },
          { type: "playOccupationPlaceholder", label: "打出职业卡", description: "支付食物后打出1张职业卡；当前版本为占位。" },
        ],
      },
    ],
    playerCounts: allPlayerCounts,
    replenish: {},
  },
];
