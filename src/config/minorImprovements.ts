import type { ActionEffect, AnimalKey, CropKey, ResourceKey } from "./baseActions";

export type CardImplementationStatus = "implemented" | "placeholder";

export type CardEffectCategory =
  | "actionBonus"
  | "actionSpace"
  | "capacity"
  | "conversion"
  | "costModifier"
  | "harvest"
  | "immediate"
  | "passing"
  | "roundStart"
  | "scoring";

export type ActionGroup =
  | "animalMarket"
  | "building"
  | "clayAccumulation"
  | "clayOrStoneAccumulation"
  | "dayLaborer"
  | "farmExpansion"
  | "fieldActions"
  | "fences"
  | "fishing"
  | "grainSeeds"
  | "lessons"
  | "majorImprovement"
  | "minorImprovement"
  | "plow"
  | "renovation"
  | "resourceMarket"
  | "sow"
  | "stoneAccumulation"
  | "travelingPlayers"
  | "woodAccumulation";

export type CardRequirement =
  | { type: "playedOccupationsAtLeast"; count: number; text: string }
  | { type: "playedOccupationsAtMost"; count: number; text: string }
  | { type: "playedOccupationsExactly"; count: number; text: string }
  | { type: "animalAtLeast"; animal: "sheep" | "boar" | "cattle"; count: number; text: string }
  | { type: "fieldsWithCropAtLeast"; crop: CropKey; count: number; text: string }
  | { type: "resourceAtLeast"; resource: ResourceKey; count: number; text: string }
  | { type: "roundAtMost"; round: number; text: string }
  | { type: "roundAtLeast"; round: number; text: string }
  | { type: "roomMaterialIn"; materials: Array<"wood" | "clay" | "stone">; text: string }
  | { type: "emptyFieldsAtLeast"; count: number; text: string }
  | { type: "allFarmyardSpacesUsed"; text: string }
  | { type: "noAnimals"; text: string }
  | { type: "workerOnActionSpace"; actionSpaceIds: string[]; text: string };

export type MinorImprovementScalingCost = {
  type: "perFamilyMember";
  cost: Partial<Record<ResourceKey, number>>;
};

export type CardTrigger =
  | "onPlay"
  | "afterAction"
  | "returnHome"
  | "roundStart"
  | "harvestStart"
  | "harvestField"
  | "scoring";

export type CardEffect =
  | { type: "gainResources"; trigger: CardTrigger; resources: Partial<Record<ResourceKey, number>>; target?: "owner" | "actor"; condition?: CardCondition; once?: boolean; onceKey?: string }
  | { type: "gainResourcesByConditionCount"; trigger: CardTrigger; count: CardConditionCount; thresholds: CardResourceThreshold[]; condition?: CardCondition }
  | { type: "gainResourcesForEachConditionCount"; trigger: CardTrigger; count: CardConditionCount; thresholds: CardResourceThreshold[]; condition?: CardCondition }
  | { type: "gainResourceUpTo"; trigger: CardTrigger; resource: ResourceKey; targetAmount: number; condition?: CardCondition }
  | { type: "gainResourcesByInventory"; trigger: CardTrigger; resource: ResourceKey; divisor: number; gainResource: ResourceKey; condition?: CardCondition }
  | { type: "gainResourcesByAnimals"; trigger: CardTrigger; animal: AnimalKey; divisor: number; gainResource: ResourceKey; condition?: CardCondition }
  | { type: "gainResourcesByRooms"; trigger: CardTrigger; resourcesPerRoom: Partial<Record<ResourceKey, number>>; condition?: CardCondition }
  | { type: "gainResourcesByFamilyMembers"; trigger: CardTrigger; resourcesPerWorker: Partial<Record<ResourceKey, number>>; resources?: Partial<Record<ResourceKey, number>>; cost?: Partial<Record<ResourceKey, number>>; condition?: CardCondition }
  | { type: "gainResourcesByFields"; trigger: CardTrigger; crop: CropKey; resourcesPerField: Partial<Record<ResourceKey, number>>; condition?: CardCondition }
  | { type: "gainResourcesByPlayedCardCount"; trigger: CardTrigger; cardKind: "occupation" | "minorImprovement" | "majorImprovement"; resourcesPerCard: Partial<Record<ResourceKey, number>>; cost?: Partial<Record<ResourceKey, number>>; countSource?: "owner" | "actorBefore" | "actorAfter"; condition?: CardCondition }
  | { type: "gainGoods"; trigger: CardTrigger; goods: Partial<Record<ResourceKey | AnimalKey, number>>; cost?: Partial<Record<ResourceKey, number>>; removeWorkers?: number; condition?: CardCondition }
  | { type: "gainAnimals"; trigger: CardTrigger; animals: Partial<Record<AnimalKey, number>>; cost?: Partial<Record<ResourceKey, number>>; storeOnCard?: boolean; condition?: CardCondition }
  | { type: "gainAnimalsByConditionCount"; trigger: CardTrigger; count: CardConditionCount; thresholds: CardAnimalThreshold[]; cost?: Partial<Record<ResourceKey, number>>; condition?: CardCondition }
  | { type: "gainPlayerCountResources"; trigger: CardTrigger; byPlayerCount: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, Partial<Record<ResourceKey | AnimalKey, number>>>> }
  | { type: "scheduleResources"; trigger: CardTrigger; schedule: CardSchedule; resources: Partial<Record<ResourceKey, number>>; condition?: CardCondition }
  | { type: "scheduleAnimals"; trigger: CardTrigger; schedule: CardSchedule; animals: Partial<Record<AnimalKey, number>>; condition?: CardCondition }
  | { type: "placeMarkers"; trigger: CardTrigger; marker: string; amount: number; condition?: CardCondition }
  | { type: "plowField"; trigger: CardTrigger; amount: number; consumeMarker?: string; cost?: Partial<Record<ResourceKey, number>>; condition?: CardCondition }
  | { type: "buildStable"; trigger: CardTrigger; amount: number; cost?: Partial<Record<ResourceKey, number>>; condition?: CardCondition }
  | { type: "renovateHouse"; trigger: CardTrigger; freeReed?: boolean; condition?: CardCondition }
  | { type: "buildRoomOrRenovate"; trigger: CardTrigger; condition?: CardCondition }
  | { type: "createFreePasture"; trigger: CardTrigger; cells: number; condition?: CardCondition }
  | { type: "addBonusPoints"; trigger: CardTrigger; amount: number; condition?: CardCondition }
  | { type: "bonusByCompletedRounds"; trigger: CardTrigger }
  | { type: "returnAccumulatedResource"; trigger: CardTrigger; resource: ResourceKey; amount: number; gainFood: number; condition?: CardCondition }
  | { type: "returnAccumulatedByThreshold"; trigger: CardTrigger; resource?: ResourceKey; thresholds: CardReturnAccumulatedThreshold[]; condition?: CardCondition }
  | { type: "moveSownField"; trigger: CardTrigger; condition?: CardCondition }
  | { type: "drawCards"; trigger: CardTrigger; deck: "minorImprovement" | "occupation"; amount: number; cost?: Partial<Record<ResourceKey, number>>; condition?: CardCondition }
  | { type: "claimAccumulated"; trigger: CardTrigger; actionSpaceId?: string; resource?: ResourceKey; once?: boolean; target?: "owner" | "actor"; condition?: CardCondition }
  | { type: "buyGoods"; trigger: CardTrigger; cost: Partial<Record<ResourceKey, number>>; goods: Partial<Record<ResourceKey | AnimalKey, number>>; condition?: CardCondition }
  | { type: "storeGoods"; trigger: CardTrigger; resources?: Partial<Record<ResourceKey, number>>; condition?: CardCondition }
  | { type: "claimStoredGoods"; trigger: CardTrigger; once?: boolean; condition?: CardCondition }
  | { type: "addAccumulated"; trigger: CardTrigger; actionSpaceIds: string[]; resources: Partial<Record<ResourceKey, number>>; condition?: CardCondition }
  | { type: "autoPlayCard"; trigger: CardTrigger; kind: "occupation" | "minorImprovement" | "occupationOrMinorImprovement"; cost?: Partial<Record<ResourceKey, number>>; condition?: CardCondition }
  | { type: "bakeBread"; trigger: CardTrigger; condition?: CardCondition }
  | { type: "sowOneField"; trigger: CardTrigger; crop?: CropKey; condition?: CardCondition }
  | { type: "createActionSpace"; trigger: CardTrigger; id: string; name: string; visibility?: "private" | "public"; ownerPayment?: Partial<Record<ResourceKey, number>>; effects: ActionEffect[]; condition?: CardCondition }
  | { type: "actionAccess"; access: "occupiedFamilyGrowth" | "immediateNewborn" | "keepTurnAfterAnimalMarket" | "keepTurnAfterAnyAction" | "freeFenceAction" | "doubleAnimalMarket" }
  | { type: "virtualField"; crop: CropKey }
  | { type: "scoring"; trigger: "scoring"; rule: CardScoringRule }
  | { type: "capacity"; scope: "housing" | "houseAnimals" | "pasture" | "cardAnimals"; amount: number; animal?: AnimalKey; condition?: CardCondition }
  | { type: "actionRestriction"; action: "renovation"; condition?: CardCondition }
  | { type: "costModifier"; scope: CostModifierScope; resource?: ResourceKey; discount?: number; discountByRooms?: boolean; discountByInitialRooms?: boolean; substitute?: { from: ResourceKey; to: ResourceKey; ratio?: number }; fixedRoomCost?: Partial<Record<ResourceKey, number>>; renovationTarget?: "clay" | "stone" }
  | { type: "conversion"; id?: string; from: Partial<Record<ResourceKey | AnimalKey, number>>; to: Partial<Record<ResourceKey | AnimalKey, number>>; timing: "anytime" | "afterAction" | "harvest" };

export type CardSchedule =
  | { type: "relativeRounds"; count: number }
  | { type: "fixedRounds"; rounds: number[] }
  | { type: "remainingEvenRounds" };

export type CardResourceThreshold = {
  min: number;
  max?: number;
  resources: Partial<Record<ResourceKey, number>>;
};

export type CardAnimalThreshold = {
  min: number;
  max?: number;
  animals: Partial<Record<AnimalKey, number>>;
};

export type CardReturnAccumulatedThreshold = {
  min: number;
  max?: number;
  returnAmount: number;
  resources?: Partial<Record<ResourceKey, number>>;
  animals?: Partial<Record<AnimalKey, number>>;
};

export type CostModifierScope =
  | "buildFence"
  | "buildRoom"
  | "buildStable"
  | "majorImprovement"
  | "minorImprovement"
  | "occupation"
  | "renovation";

export type CardScoringRule =
  | { type: "pastureCells"; thresholds: Array<{ min: number; points: number }> }
  | { type: "roomMaterial"; points: Partial<Record<"wood" | "clay" | "stone", number>> }
  | { type: "animalsPer"; animal: AnimalKey; per: number; points: number }
  | { type: "playedImprovements"; thresholds: Array<{ min: number; points: number }> }
  | { type: "unfencedStables"; pointsEach: number }
  | { type: "pasturesWithAnimals"; pointsEach: number; extraIfAnimalsAtLeast?: { count: number; points: number } }
  | { type: "playedOccupationsAfterThis"; pointsEach: number }
  | { type: "roomLeader"; points: number }
  | { type: "playedRoundThreshold"; thresholds: Array<{ maxRound: number; points: number }> }
  | { type: "familySize"; thresholds: Array<{ min: number; points: number }> };

export type CardConditionCount =
  | { type: "actionSpacesOccupied"; ids: string[] }
  | { type: "actionSpacesWithAccumulated"; ids: string[]; resource: ResourceKey; atLeast?: number }
  | { type: "playersWithAnimalAtLeast"; animal: AnimalKey; count: number }
  | { type: "accumulatedTaken"; resource?: ResourceKey }
  | { type: "harvestedCropFields"; crop: CropKey; actor?: "self" | "any" | "other" }
  | { type: "remainingRounds" };

export type CardComparisonMetric =
  | { type: "occupations" }
  | { type: "resource"; resource: ResourceKey };

export type CardCondition =
  | { type: "actionGroup"; groups: ActionGroup[]; actor?: "self" | "any" | "other" }
  | { type: "actionId"; ids: string[]; actor?: "self" | "any" | "other" }
  | { type: "selectedEffectType"; types: string[] }
  | { type: "bakeBreadUsed"; actor?: "self" | "any" | "other" }
  | { type: "accumulatedTaken"; resource?: ResourceKey; atLeast?: number; actor?: "self" | "any" | "other" }
  | { type: "actionOrdinalAtLeast"; count: number; actor?: "self" | "any" | "other" }
  | { type: "actionSpaceEmpty"; ids: string[] }
  | { type: "actionSpacesOccupied"; ids: string[] }
  | { type: "actionSpacesWithAccumulated"; ids: string[]; resource: ResourceKey; atLeast?: number; minCount?: number }
  | { type: "playersWithAnimalAtLeast"; animal: AnimalKey; animalCount: number; minPlayers: number }
  | { type: "newPastureCreated"; minCells?: number; previouslyUnfenced?: boolean; actor?: "self" | "any" | "other" }
  | { type: "roundCardRevealed"; ids: string[] }
  | { type: "playerCountAtLeast"; count: number }
  | { type: "otherPlayerHasMore"; metrics: CardComparisonMetric[] }
  | { type: "ownedMajorImprovementCostAtLeast"; count: number; resources?: ResourceKey[] }
  | { type: "uniquePlayerWithRoomsExactly"; count: number }
  | { type: "builtRoomsWithMaterial"; material: "wood" | "clay" | "stone"; actor?: "self" | "any" | "other" }
  | { type: "renovatedFromTo"; from: "wood" | "clay"; to: "clay" | "stone"; actor?: "self" | "any" | "other" }
  | { type: "pasturesExactly"; count: number }
  | { type: "actorPaidResources"; resources: Partial<Record<ResourceKey, number>>; actor?: "self" | "any" | "other" }
  | { type: "fieldComposition"; grainFieldsAtLeast?: number; vegetableFieldsAtLeast?: number; emptyFieldsAtLeast?: number }
  | { type: "roomMaterial"; materials: Array<"wood" | "clay" | "stone"> }
  | { type: "roomsAtLeast"; count: number }
  | { type: "roomsExactly"; count: number }
  | { type: "workersExactly"; count: number }
  | { type: "animalsAtLeast"; animal: AnimalKey; count: number }
  | { type: "roundAtLeast"; round: number }
  | { type: "roundAtMost"; round: number }
  | { type: "playedOccupationsAtLeast"; count: number }
  | { type: "allOf"; conditions: CardCondition[] }
  | { type: "anyOf"; conditions: CardCondition[] };

export interface MinorImprovementDefinition {
  id: string;
  name: string;
  sourceName?: string;
  deck: "A" | "B" | "L" | "unknown";
  cost: Partial<Record<ResourceKey, number>>;
  animalCost: Partial<Record<AnimalKey, number>>;
  scalingCost?: MinorImprovementScalingCost;
  costText: string;
  prerequisiteText?: string;
  requirements: CardRequirement[];
  victoryPoints: number;
  passesAfterPlay: boolean;
  effectText: string;
  effectCategories: CardEffectCategory[];
  effects: CardEffect[];
  implementationStatus: CardImplementationStatus;
}

type MinorSeed = Omit<MinorImprovementDefinition, "animalCost" | "cost" | "costText" | "deck" | "effects" | "implementationStatus" | "passesAfterPlay" | "requirements" | "scalingCost" | "victoryPoints"> & {
  cost?: Partial<Record<ResourceKey, number>>;
  animalCost?: Partial<Record<AnimalKey, number>>;
  scalingCost?: MinorImprovementScalingCost;
  costText?: string;
  deck?: MinorImprovementDefinition["deck"];
  effects?: CardEffect[];
  implementationStatus?: CardImplementationStatus;
  passesAfterPlay?: boolean;
  requirements?: CardRequirement[];
  victoryPoints?: number;
};

function minor(seed: MinorSeed): MinorImprovementDefinition {
  return {
    deck: seed.deck ?? "unknown",
    cost: seed.cost ?? {},
    animalCost: seed.animalCost ?? {},
    costText: seed.costText ?? describeCost(seed.cost ?? {}, seed.animalCost ?? {}, seed.scalingCost),
    requirements: seed.requirements ?? [],
    victoryPoints: seed.victoryPoints ?? 0,
    passesAfterPlay: seed.passesAfterPlay ?? false,
    effects: seed.effects ?? [],
    implementationStatus: seed.implementationStatus ?? "implemented",
    ...seed,
  };
}

function describeCost(cost: Partial<Record<ResourceKey, number>>, animalCost: Partial<Record<AnimalKey, number>>, scalingCost?: MinorImprovementScalingCost): string {
  const resourceEntries = Object.entries(cost).filter((entry): entry is [ResourceKey, number] => entry[1] > 0);
  const animalEntries = Object.entries(animalCost).filter((entry): entry is [AnimalKey, number] => entry[1] > 0);
  const parts = [
    ...resourceEntries.map(([resource, amount]) => `${amount}${resourceLabel(resource)}`),
    ...animalEntries.map(([animal, amount]) => `${amount}${animalLabel(animal)}`),
  ];
  if (scalingCost?.type === "perFamilyMember") {
    parts.push(`每个家庭成员 ${describeCost(scalingCost.cost, {})}`);
  }
  if (parts.length === 0) return "无";
  return parts.join("、");
}

function resourceLabel(resource: ResourceKey): string {
  const labels: Record<ResourceKey, string> = {
    wood: "木材",
    clay: "黏土",
    reed: "芦苇",
    stone: "石头",
    grain: "谷物",
    vegetable: "蔬菜",
    food: "食物",
  };
  return labels[resource];
}

function animalLabel(animal: AnimalKey): string {
  const labels: Record<AnimalKey, string> = {
    sheep: "羊",
    boar: "野猪",
    cattle: "牛",
  };
  return labels[animal];
}

export function getMinorImprovementResourceCost(card: MinorImprovementDefinition, familyMemberCount: number): Partial<Record<ResourceKey, number>> {
  const total = { ...card.cost };
  if (card.scalingCost?.type === "perFamilyMember") {
    Object.entries(card.scalingCost.cost).forEach(([resource, amount]) => {
      const key = resource as ResourceKey;
      total[key] = (total[key] ?? 0) + (amount ?? 0) * familyMemberCount;
    });
  }
  return total;
}

const minorImprovementBase: MinorImprovementDefinition[] = [
  minor({
    id: "caravan",
    name: "Caravan",
    deck: "B",
    cost: { wood: 3 },
    victoryPoints: 3,
    effectCategories: ["capacity"],
    effectText: "这张牌提供 1 人的住房容量。",
  }),
  minor({
    id: "bottles",
    name: "Bottles",
    deck: "B",
    scalingCost: { type: "perFamilyMember", cost: { clay: 1, food: 1 } },
    costText: "每个家庭成员额外支付 1 黏土和 1 食物",
    victoryPoints: 4,
    effectCategories: ["scoring"],
    effectText: "打出时按家庭成员数量支付额外成本；本身有 4 分。",
  }),
  minor({
    id: "shifting-cultivation",
    name: "Shifting Cultivation",
    deck: "A",
    cost: { food: 2 },
    costText: "2 食物",
    passesAfterPlay: true,
    effectCategories: ["immediate", "passing"],
    effectText: "立即翻耕 1 块田，然后传给左手玩家。",
  }),
  minor({
    id: "clay-embankment",
    name: "Clay Embankment",
    deck: "A",
    costText: "无",
    passesAfterPlay: true,
    effectCategories: ["immediate", "passing"],
    effectText: "每有 2 个已拥有的黏土，立即获得 1 黏土，然后传给左手玩家。",
  }),
  minor({
    id: "young-animal-market",
    name: "Young Animal Market",
    deck: "A",
    animalCost: { sheep: 1 },
    costText: "1 羊",
    passesAfterPlay: true,
    effectCategories: ["immediate", "passing"],
    effectText: "立即获得 1 牛；相当于用 1 羊交换 1 牛，然后传给左手玩家。",
  }),
  minor({
    id: "drinking-trough",
    name: "Drinking Trough",
    deck: "A",
    cost: { wood: 1 },
    effectCategories: ["capacity"],
    effectText: "每个有或没有马厩的牧场都能多容纳 2 只动物。",
  }),
  minor({
    id: "rammed-clay",
    name: "Rammed Clay",
    deck: "A",
    effectCategories: ["costModifier"],
    effectText: "打出时立即获得 1 黏土；建围栏时可以用黏土代替木材。",
  }),
  minor({
    id: "handplow",
    name: "Handplow",
    deck: "A",
    cost: { wood: 1 },
    effectCategories: ["actionBonus"],
    effectText: "给当前轮和下一轮的对应回合格各放置 1 个田地标记；回合开始时可翻耕该田。",
  }),
  minor({
    id: "threshing-board",
    name: "Threshing Board",
    deck: "A",
    cost: { wood: 1 },
    prerequisiteText: "2 Occupations",
    requirements: [{ type: "playedOccupationsAtLeast", count: 2, text: "至少打出 2 张职业卡" }],
    victoryPoints: 1,
    effectCategories: ["actionBonus"],
    effectText: "每次使用农田行动格时，也可以额外执行烤面包行动。",
  }),
  minor({
    id: "sleeping-corner",
    name: "Sleeping Corner",
    deck: "A",
    cost: { wood: 1 },
    prerequisiteText: "2 Grain Fields",
    requirements: [{ type: "fieldsWithCropAtLeast", crop: "grain", count: 2, text: "至少 2 块谷物田" }],
    victoryPoints: 1,
    effectCategories: ["actionBonus"],
    effectText: "即使“生孩子”行动格被其他玩家占用，也可以使用该行动格。",
  }),
  minor({
    id: "manger",
    name: "Manger",
    deck: "A",
    costText: "无",
    effectCategories: ["scoring"],
    effectText: "计分时，如果你的牧场覆盖至少 6/7/8/10 个农场格，获得 1/2/3/4 奖励分。",
  }),
  minor({
    id: "big-country",
    name: "Big Country",
    deck: "A",
    prerequisiteText: "All Farmyard Spaces Used",
    requirements: [{ type: "allFarmyardSpacesUsed", text: "所有农场格都已使用" }],
    effectCategories: ["immediate", "scoring"],
    effectText: "每完成一轮后立即获得 1 奖励分和 2 食物。",
  }),
  minor({
    id: "wool-blankets",
    name: "Wool Blankets",
    deck: "A",
    prerequisiteText: "5 Sheep",
    requirements: [{ type: "animalAtLeast", animal: "sheep", count: 5, text: "至少 5 只羊" }],
    effectCategories: ["scoring"],
    effectText: "计分时，如果你住在木屋、瓦房或石屋，分别获得 3/2/0 奖励分。",
  }),
  minor({
    id: "pond-hut",
    name: "Pond Hut",
    deck: "A",
    prerequisiteText: "Exactly 2 Occupations",
    requirements: [{ type: "playedOccupationsExactly", count: 2, text: "恰好打出 2 张职业卡" }],
    victoryPoints: 1,
    effectCategories: ["roundStart"],
    effectText: "在后续 3 个回合格各放 1 食物；这些回合开始时获得该食物。",
  }),
  minor({
    id: "milk-jug",
    name: "Milk Jug",
    deck: "A",
    cost: { wood: 1 },
    effectCategories: ["actionBonus"],
    effectText: "任意玩家使用牛市场累积格时，你获得 3 食物，使用者获得 1 食物。",
  }),
  minor({
    id: "claypipe",
    name: "Claypipe",
    deck: "A",
    cost: { clay: 1 },
    effectCategories: ["roundStart"],
    effectText: "回家阶段中，如果你上一工作阶段在第 7 个及以后行动，获得 2 食物。",
  }),
  minor({
    id: "junk-room",
    name: "Junk Room",
    deck: "A",
    cost: { wood: 1, clay: 1 },
    effectCategories: ["immediate"],
    effectText: "每次建造设施（包括本张）后，获得 1 食物。",
  }),
  minor({
    id: "basket",
    name: "Basket",
    deck: "A",
    cost: { reed: 1 },
    costText: "1 芦苇",
    effectCategories: ["actionBonus"],
    effectText: "每次使用木材累积格后，可以将 2 木材换成 3 食物，并把这些木材放到该累积格上。",
  }),
  minor({
    id: "dutch-windmill",
    name: "Dutch Windmill",
    deck: "A",
    cost: { wood: 2, stone: 2 },
    victoryPoints: 2,
    effectCategories: ["harvest"],
    effectText: "每次因收获后使用烤面包行动获得营养时，额外获得 3 食物。",
  }),
  minor({
    id: "corn-scoop",
    name: "Corn Scoop",
    deck: "A",
    cost: { wood: 1 },
    effectCategories: ["actionBonus"],
    effectText: "每次使用谷物种子行动格时，额外获得 1 谷物。",
  }),
  minor({
    id: "large-greenhouse",
    name: "Large Greenhouse",
    deck: "A",
    prerequisiteText: "2 Occupations",
    requirements: [{ type: "playedOccupationsAtLeast", count: 2, text: "至少 2 张职业卡" }],
    cost: { wood: 2 },
    effectCategories: ["roundStart"],
    effectText: "在第 4、7、9 轮各放 1 蔬菜；这些回合开始时获得该蔬菜。",
  }),
  minor({
    id: "clearing-spade",
    name: "Clearing Spade",
    deck: "A",
    cost: { wood: 1 },
    effectCategories: ["immediate"],
    effectText: "任意时候可以把一个至少有 2 个作物的已播种田移动到空农场格。",
  }),
  minor({
    id: "lumber-mill",
    name: "Lumber Mill",
    deck: "A",
    prerequisiteText: "At Most 3 Occupations",
    requirements: [{ type: "playedOccupationsAtMost", count: 3, text: "至多打出 3 张职业卡" }],
    victoryPoints: 2,
    effectCategories: ["costModifier"],
    effectText: "每张设施少花 1 木材。",
  }),
  minor({
    id: "canoe",
    name: "Canoe",
    deck: "A",
    prerequisiteText: "1 Occupation",
    requirements: [{ type: "playedOccupationsAtLeast", count: 1, text: "至少 1 张职业卡" }],
    cost: { wood: 2 },
    victoryPoints: 1,
    effectCategories: ["actionBonus"],
    effectText: "每次使用捕鱼累积格时，额外获得 1 食物和 1 芦苇。",
  }),
  minor({
    id: "stone-tongs",
    name: "Stone Tongs",
    deck: "A",
    cost: { wood: 1 },
    effectCategories: ["actionBonus"],
    effectText: "每次使用石头累积格时，额外获得 1 石头。",
  }),
  minor({
    id: "shepherds-crook",
    name: "Shepherd's Crook",
    deck: "A",
    cost: { wood: 1 },
    effectCategories: ["immediate"],
    effectText: "每次围起一个包含至少 4 个农场格的新牧场时，立即获得 2 只羊放入该牧场。",
  }),
  minor({
    id: "mini-pasture",
    name: "Mini Pasture",
    deck: "B",
    cost: { food: 2 },
    costText: "2 食物",
    passesAfterPlay: true,
    effectCategories: ["immediate", "passing"],
    effectText: "立即围起 1 个农场格且不用支付围栏木材，然后传给左手玩家。",
  }),
  minor({
    id: "market-stall",
    name: "Market Stall",
    deck: "B",
    cost: { grain: 1 },
    costText: "1 谷物",
    passesAfterPlay: true,
    effectCategories: ["immediate", "passing"],
    effectText: "立即获得 1 蔬菜，相当于用 1 谷物交换 1 蔬菜，然后传给左手玩家。",
  }),
  minor({
    id: "carpenters-parlor",
    name: "Carpenter's Parlor",
    deck: "B",
    cost: { wood: 1, stone: 1 },
    effectCategories: ["costModifier"],
    effectText: "木屋新房间只需 2 木材和 2 芦苇。",
  }),
  minor({
    id: "mining-hammer",
    name: "Mining Hammer",
    deck: "B",
    cost: { wood: 1 },
    effectCategories: ["immediate"],
    effectText: "打出时立即获得 1 食物；之后每个阶段可不付木材建 1 个马厩。",
  }),
  minor({
    id: "moldboard-plow",
    name: "Moldboard Plow",
    deck: "B",
    prerequisiteText: "1 Occupation",
    requirements: [{ type: "playedOccupationsAtLeast", count: 1, text: "至少 1 张职业卡" }],
    cost: { wood: 2 },
    effectCategories: ["actionBonus"],
    effectText: "本牌放 2 个田地标记；本局两次使用农田行动格时可以从本牌翻耕 1 块额外田。",
  }),
  minor({
    id: "lasso",
    name: "Lasso",
    deck: "B",
    cost: { reed: 1 },
    costText: "1 芦苇",
    effectCategories: ["actionBonus"],
    effectText: "如果至少一个行动是羊/猪/牛市场，可以在一次回合中连续放置正好两个工人。",
  }),
  minor({
    id: "bread-paddle",
    name: "Bread Paddle",
    deck: "B",
    cost: { wood: 1 },
    effectCategories: ["immediate", "actionBonus"],
    effectText: "打出时立即获得 1 食物；之后每打出职业卡，可额外执行烤面包行动。",
  }),
  minor({
    id: "mantelpiece",
    name: "Mantelpiece",
    deck: "B",
    prerequisiteText: "Clay or Stone House",
    requirements: [{ type: "roomMaterialIn", materials: ["clay", "stone"], text: "住在瓦房或石屋" }],
    cost: { wood: 1 },
    victoryPoints: 3,
    effectCategories: ["scoring"],
    effectText: "打出时立即获得每个已完成回合 1 奖励分；你不能再翻修房屋。",
  }),
  minor({
    id: "loom",
    name: "Loom",
    deck: "B",
    prerequisiteText: "2 Occupations",
    requirements: [{ type: "playedOccupationsAtLeast", count: 2, text: "至少 2 张职业卡" }],
    victoryPoints: 1,
    effectCategories: ["harvest", "scoring"],
    effectText: "每次收获田地阶段，如果至少有 1/4/7 只羊，获得 1/2/3 食物；计分时每 3 羊 1 奖励分。",
  }),
  minor({
    id: "strawberry-patch",
    name: "Strawberry Patch",
    deck: "B",
    prerequisiteText: "2 Vegetable Fields",
    requirements: [{ type: "fieldsWithCropAtLeast", crop: "vegetable", count: 2, text: "至少 2 块蔬菜田" }],
    cost: { wood: 1 },
    victoryPoints: 2,
    effectCategories: ["roundStart"],
    effectText: "在后续 3 个回合格各放 1 食物；这些回合开始时获得该食物。",
  }),
  minor({
    id: "herring-pot",
    name: "Herring Pot",
    deck: "B",
    cost: { clay: 1 },
    effectCategories: ["actionBonus"],
    effectText: "每次使用捕鱼累积格时，在后续 3 个回合格各放 1 食物；这些回合开始时获得。",
  }),
  minor({
    id: "butter-churn",
    name: "Butter Churn",
    deck: "B",
    prerequisiteText: "At Most 3 Occupations",
    requirements: [{ type: "playedOccupationsAtMost", count: 3, text: "至多打出 3 张职业卡" }],
    cost: { wood: 1 },
    victoryPoints: 1,
    effectCategories: ["harvest"],
    effectText: "每次收获田地阶段，每 3 羊获得 1 食物，每 2 牛获得 1 食物。",
  }),
  minor({
    id: "brook",
    name: "Brook",
    deck: "B",
    prerequisiteText: "1 of Your People on Fishing",
    requirements: [{ type: "workerOnActionSpace", actionSpaceIds: ["fishing"], text: "你有 1 个工人在捕鱼行动格" }],
    effectCategories: ["actionBonus"],
    effectText: "每次使用捕鱼上方的四个行动格之一时，额外获得 1 食物。",
  }),
  minor({
    id: "scullery",
    name: "Scullery",
    deck: "B",
    cost: { clay: 1, wood: 1 },
    effectCategories: ["roundStart"],
    effectText: "每回合开始时，如果你住在木屋，获得 1 食物。",
  }),
  minor({
    id: "three-field-rotation",
    name: "Three-Field Rotation",
    deck: "B",
    prerequisiteText: "3 Occupations",
    requirements: [{ type: "playedOccupationsAtLeast", count: 3, text: "至少 3 张职业卡" }],
    effectCategories: ["harvest"],
    effectText: "每次收获田地阶段开始时，若至少有 1 块谷物田、1 块蔬菜田和 1 块空田，获得 3 食物。",
  }),
  minor({
    id: "pitchfork",
    name: "Pitchfork",
    deck: "B",
    cost: { reed: 1 },
    costText: "1 芦苇",
    effectCategories: ["actionBonus"],
    effectText: "每次使用谷物种子行动格时，如果农田行动格空置，也获得 3 食物。",
  }),
  minor({
    id: "sack-cart",
    name: "Sack Cart",
    deck: "B",
    prerequisiteText: "2 Occupations",
    requirements: [{ type: "playedOccupationsAtLeast", count: 2, text: "至少 2 张职业卡" }],
    cost: { wood: 2 },
    effectCategories: ["roundStart"],
    effectText: "在第 5、8、11、14 轮各放 1 谷物；这些回合开始时获得该谷物。",
  }),
  minor({
    id: "beanfield",
    name: "Beanfield",
    deck: "B",
    prerequisiteText: "2 Occupations",
    requirements: [{ type: "playedOccupationsAtLeast", count: 2, text: "至少 2 张职业卡" }],
    cost: { grain: 1 },
    costText: "1 谷物",
    victoryPoints: 1,
    effectCategories: ["capacity"],
    effectText: "这是一块只能种蔬菜的田。",
  }),
  minor({
    id: "thick-forest",
    name: "Thick Forest",
    deck: "B",
    prerequisiteText: "5 Clay in Your Supply",
    requirements: [{ type: "resourceAtLeast", resource: "clay", count: 5, text: "库存至少 5 黏土" }],
    effectCategories: ["roundStart"],
    effectText: "在每个仍未开始的偶数回合格放 1 木材；这些回合开始时获得木材。",
  }),
  minor({
    id: "loam-pit",
    name: "Loam Pit",
    deck: "B",
    prerequisiteText: "3 Occupations",
    requirements: [{ type: "playedOccupationsAtLeast", count: 3, text: "至少 3 张职业卡" }],
    victoryPoints: 1,
    effectCategories: ["actionBonus"],
    effectText: "每次使用打零工行动格时，额外获得 3 黏土。",
  }),
  minor({
    id: "hard-porcelain",
    name: "Hard Porcelain",
    deck: "B",
    cost: { clay: 1 },
    effectCategories: ["conversion"],
    effectText: "任意时候，可以按 2/3/4 黏土换 1/2/3 石头。",
  }),
  minor({
    id: "acorns-basket",
    name: "Acorns Basket",
    deck: "B",
    prerequisiteText: "3 Occupations",
    requirements: [{ type: "playedOccupationsAtLeast", count: 3, text: "至少 3 张职业卡" }],
    cost: { reed: 1 },
    costText: "1 芦苇",
    effectCategories: ["roundStart"],
    effectText: "在后续 2 个回合格各放 1 野猪；这些回合开始时获得野猪。",
  }),
  minor({
    id: "bagpipe",
    name: "Bagpipe",
    deck: "L",
    prerequisiteText: "1 Sheep",
    requirements: [{ type: "animalAtLeast", animal: "sheep", count: 1, text: "至少 1 只羊" }],
    effectCategories: ["harvest"],
    effectText: "每次收获开始时，获得 1 食物。",
  }),
  minor({
    id: "brooch",
    name: "Brooch",
    deck: "L",
    cost: { stone: 1 },
    victoryPoints: 1,
    effectCategories: ["scoring"],
    effectText: "计分时，根据家庭成员数与其他条件获得额外分；卡面包含负分到正分的分值路径。",
  }),
  minor({
    id: "whisky-barrels",
    name: "Whisky Barrels",
    deck: "L",
    cost: { grain: 3 },
    costText: "3 谷物",
    effectCategories: ["scoring"],
    effectText: "若在第 6/8/10/12 轮或更早打出，计分时获得 5/3/2/1 奖励分。",
  }),
  minor({
    id: "highland-cattle",
    name: "Highland Cattle",
    deck: "L",
    prerequisiteText: "No Animals",
    requirements: [{ type: "noAnimals", text: "没有任何动物" }],
    effectCategories: ["immediate"],
    effectText: "打出时立即获得 1 牛，可以养在本牌上。",
  }),
  minor({
    id: "hidden-minor",
    name: "Hidden",
    deck: "unknown",
    implementationStatus: "placeholder",
    effectCategories: [],
    effectText: "隐藏卡，效果未知。",
  }),
];

const minorOverrides: Record<string, Partial<MinorImprovementDefinition>> = {
  caravan: {
    name: "篷车",
    sourceName: "Caravan",
    effects: [{ type: "capacity", scope: "housing", amount: 1 }],
  },
  bottles: {
    name: "瓶罐",
    sourceName: "Bottles",
    effects: [{ type: "scoring", trigger: "scoring", rule: { type: "familySize", thresholds: [{ min: 1, points: 0 }] } }],
  },
  "shifting-cultivation": {
    name: "迁移耕作",
    sourceName: "Shifting Cultivation",
    effects: [{ type: "plowField", trigger: "onPlay", amount: 1 }],
  },
  "clay-embankment": {
    name: "黏土堤",
    sourceName: "Clay Embankment",
    effects: [{ type: "gainResourcesByInventory", trigger: "onPlay", resource: "clay", divisor: 2, gainResource: "clay" }],
  },
  "young-animal-market": {
    name: "幼畜市场",
    sourceName: "Young Animal Market",
    effects: [{ type: "gainAnimals", trigger: "onPlay", animals: { cattle: 1 } }],
  },
  "drinking-trough": {
    name: "饮水槽",
    sourceName: "Drinking Trough",
    effects: [{ type: "capacity", scope: "pasture", amount: 2 }],
  },
  "rammed-clay": {
    name: "夯土",
    sourceName: "Rammed Clay",
    effects: [
      { type: "gainResources", trigger: "onPlay", resources: { clay: 1 } },
      { type: "costModifier", scope: "buildFence", substitute: { from: "wood", to: "clay" } },
    ],
  },
  handplow: {
    name: "手犁",
    sourceName: "Handplow",
    effects: [
      { type: "placeMarkers", trigger: "onPlay", marker: "plow", amount: 2 },
      { type: "plowField", trigger: "roundStart", amount: 1, consumeMarker: "plow" },
    ],
  },
  "threshing-board": {
    name: "打谷板",
    sourceName: "Threshing Board",
    effects: [{ type: "bakeBread", trigger: "afterAction", condition: { type: "actionGroup", groups: ["plow"] } }],
  },
  "sleeping-corner": {
    name: "睡角",
    sourceName: "Sleeping Corner",
    effects: [{ type: "actionAccess", access: "occupiedFamilyGrowth" }],
  },
  manger: {
    name: "饲槽",
    sourceName: "Manger",
    effects: [{ type: "scoring", trigger: "scoring", rule: { type: "pastureCells", thresholds: [{ min: 6, points: 1 }, { min: 7, points: 2 }, { min: 8, points: 3 }, { min: 10, points: 4 }] } }],
  },
  "big-country": {
    name: "广阔农场",
    sourceName: "Big Country",
    effects: [{ type: "gainResources", trigger: "roundStart", resources: { food: 2 } }, { type: "addBonusPoints", trigger: "roundStart", amount: 1 }],
  },
  "wool-blankets": {
    name: "羊毛毯",
    sourceName: "Wool Blankets",
    effects: [{ type: "scoring", trigger: "scoring", rule: { type: "roomMaterial", points: { wood: 3, clay: 2, stone: 0 } } }],
  },
  "pond-hut": {
    name: "池塘小屋",
    sourceName: "Pond Hut",
    effects: [{ type: "scheduleResources", trigger: "onPlay", schedule: { type: "relativeRounds", count: 3 }, resources: { food: 1 } }],
  },
  "milk-jug": {
    name: "奶壶",
    sourceName: "Milk Jug",
    effects: [
      { type: "gainResources", trigger: "afterAction", resources: { food: 3 }, condition: { type: "actionId", ids: ["cattle-market"], actor: "any" } },
      { type: "gainResources", trigger: "afterAction", target: "actor", resources: { food: 1 }, condition: { type: "actionId", ids: ["cattle-market"], actor: "any" } },
    ],
  },
  claypipe: {
    name: "陶烟斗",
    sourceName: "Claypipe",
    effects: [{ type: "gainResources", trigger: "returnHome", resources: { food: 2 }, condition: { type: "actionOrdinalAtLeast", count: 7 } }],
  },
  "junk-room": {
    name: "杂物间",
    sourceName: "Junk Room",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { food: 1 }, condition: { type: "actionGroup", groups: ["majorImprovement", "minorImprovement"] } }],
  },
  basket: {
    name: "篮子",
    sourceName: "Basket",
    effects: [{ type: "returnAccumulatedResource", trigger: "afterAction", resource: "wood", amount: 2, gainFood: 3, condition: { type: "actionGroup", groups: ["woodAccumulation"] } }],
  },
  "dutch-windmill": {
    name: "荷兰风车",
    sourceName: "Dutch Windmill",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { food: 3 }, condition: { type: "bakeBreadUsed" } }],
  },
  "corn-scoop": {
    name: "谷物勺",
    sourceName: "Corn Scoop",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { grain: 1 }, condition: { type: "actionGroup", groups: ["grainSeeds"] } }],
  },
  "large-greenhouse": {
    name: "大型温室",
    sourceName: "Large Greenhouse",
    effects: [{ type: "scheduleResources", trigger: "onPlay", schedule: { type: "fixedRounds", rounds: [4, 7, 9] }, resources: { vegetable: 1 } }],
  },
  "clearing-spade": {
    name: "清地铲",
    sourceName: "Clearing Spade",
    effects: [{ type: "moveSownField", trigger: "afterAction", condition: { type: "actionGroup", groups: ["fieldActions"] } }],
  },
  "lumber-mill": {
    name: "木材厂",
    sourceName: "Lumber Mill",
    effects: [{ type: "costModifier", scope: "minorImprovement", resource: "wood", discount: 1 }, { type: "costModifier", scope: "majorImprovement", resource: "wood", discount: 1 }],
  },
  canoe: {
    name: "独木舟",
    sourceName: "Canoe",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { food: 1, reed: 1 }, condition: { type: "actionGroup", groups: ["fishing"] } }],
  },
  "stone-tongs": {
    name: "石钳",
    sourceName: "Stone Tongs",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { stone: 1 }, condition: { type: "actionGroup", groups: ["stoneAccumulation"] } }],
  },
  "shepherds-crook": {
    name: "牧羊杖",
    sourceName: "Shepherd's Crook",
    effects: [{ type: "gainAnimals", trigger: "afterAction", animals: { sheep: 2 }, condition: { type: "newPastureCreated", minCells: 4 } }],
  },
  "mini-pasture": {
    name: "迷你牧场",
    sourceName: "Mini Pasture",
    effects: [{ type: "createFreePasture", trigger: "onPlay", cells: 1 }],
  },
  "market-stall": {
    name: "市场摊位",
    sourceName: "Market Stall",
    effects: [{ type: "gainResources", trigger: "onPlay", resources: { vegetable: 1 } }],
  },
  "carpenters-parlor": {
    name: "木匠客厅",
    sourceName: "Carpenter's Parlor",
    effects: [{ type: "costModifier", scope: "buildRoom", fixedRoomCost: { wood: 2, reed: 2 } }],
  },
  "mining-hammer": {
    name: "采矿锤",
    sourceName: "Mining Hammer",
    effects: [{ type: "gainResources", trigger: "onPlay", resources: { food: 1 } }, { type: "costModifier", scope: "buildStable", resource: "wood", discount: 2 }],
  },
  "moldboard-plow": {
    name: "翻土犁",
    sourceName: "Moldboard Plow",
    effects: [{ type: "placeMarkers", trigger: "onPlay", marker: "plow", amount: 2 }, { type: "plowField", trigger: "afterAction", amount: 1, consumeMarker: "plow", condition: { type: "actionGroup", groups: ["plow"] } }],
  },
  lasso: {
    name: "套索",
    sourceName: "Lasso",
    effects: [{ type: "actionAccess", access: "keepTurnAfterAnimalMarket" }],
  },
  "bread-paddle": {
    name: "面包铲",
    sourceName: "Bread Paddle",
    effects: [{ type: "gainResources", trigger: "onPlay", resources: { food: 1 } }, { type: "bakeBread", trigger: "afterAction", condition: { type: "actionGroup", groups: ["lessons"] } }],
  },
  mantelpiece: {
    name: "壁炉台",
    sourceName: "Mantelpiece",
    effects: [{ type: "bonusByCompletedRounds", trigger: "onPlay" }, { type: "actionRestriction", action: "renovation" }],
  },
  loom: {
    name: "织布机",
    sourceName: "Loom",
    effects: [
      { type: "gainResources", trigger: "harvestField", resources: { food: 1 }, condition: { type: "animalsAtLeast", animal: "sheep", count: 1 } },
      { type: "gainResources", trigger: "harvestField", resources: { food: 1 }, condition: { type: "animalsAtLeast", animal: "sheep", count: 4 } },
      { type: "gainResources", trigger: "harvestField", resources: { food: 1 }, condition: { type: "animalsAtLeast", animal: "sheep", count: 7 } },
      { type: "scoring", trigger: "scoring", rule: { type: "animalsPer", animal: "sheep", per: 3, points: 1 } },
    ],
  },
  "strawberry-patch": {
    name: "草莓地",
    sourceName: "Strawberry Patch",
    effects: [{ type: "scheduleResources", trigger: "onPlay", schedule: { type: "relativeRounds", count: 3 }, resources: { food: 1 } }],
  },
  "herring-pot": {
    name: "鲱鱼锅",
    sourceName: "Herring Pot",
    effects: [{ type: "scheduleResources", trigger: "afterAction", schedule: { type: "relativeRounds", count: 3 }, resources: { food: 1 }, condition: { type: "actionGroup", groups: ["fishing"] } }],
  },
  "butter-churn": {
    name: "搅乳器",
    sourceName: "Butter Churn",
    effects: [
      { type: "gainResourcesByAnimals", trigger: "harvestField", animal: "sheep", divisor: 3, gainResource: "food" },
      { type: "gainResourcesByAnimals", trigger: "harvestField", animal: "cattle", divisor: 2, gainResource: "food" },
    ],
  },
  brook: {
    name: "小溪",
    sourceName: "Brook",
    requirements: [{ type: "workerOnActionSpace", actionSpaceIds: ["fishing"], text: "你有 1 个工人在捕鱼行动格" }],
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { food: 1 }, condition: { type: "actionId", ids: ["day-laborer", "farmland", "grain-seeds", "farm-expansion"] } }],
  },
  scullery: {
    name: "洗碗间",
    sourceName: "Scullery",
    effects: [{ type: "gainResources", trigger: "roundStart", resources: { food: 1 }, condition: { type: "roomMaterial", materials: ["wood"] } }],
  },
  "three-field-rotation": {
    name: "三圃轮作",
    sourceName: "Three-Field Rotation",
    effects: [{ type: "gainResources", trigger: "harvestStart", resources: { food: 3 }, condition: { type: "fieldComposition", grainFieldsAtLeast: 1, vegetableFieldsAtLeast: 1, emptyFieldsAtLeast: 1 } }],
  },
  pitchfork: {
    name: "干草叉",
    sourceName: "Pitchfork",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { food: 3 }, condition: { type: "allOf", conditions: [{ type: "actionGroup", groups: ["grainSeeds"] }, { type: "actionSpaceEmpty", ids: ["farmland"] }] } }],
  },
  "sack-cart": {
    name: "麻袋车",
    sourceName: "Sack Cart",
    effects: [{ type: "scheduleResources", trigger: "onPlay", schedule: { type: "fixedRounds", rounds: [5, 8, 11, 14] }, resources: { grain: 1 } }],
  },
  beanfield: {
    name: "豆田",
    sourceName: "Beanfield",
    effects: [{ type: "virtualField", crop: "vegetable" }],
  },
  "thick-forest": {
    name: "密林",
    sourceName: "Thick Forest",
    effects: [{ type: "scheduleResources", trigger: "onPlay", schedule: { type: "remainingEvenRounds" }, resources: { wood: 1 } }],
  },
  "loam-pit": {
    name: "壤土坑",
    sourceName: "Loam Pit",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { clay: 3 }, condition: { type: "actionGroup", groups: ["dayLaborer"] } }],
  },
  "hard-porcelain": {
    name: "硬瓷",
    sourceName: "Hard Porcelain",
    effects: [
      { type: "conversion", id: "clay-2-stone-1", timing: "anytime", from: { clay: 2 }, to: { stone: 1 } },
      { type: "conversion", id: "clay-3-stone-2", timing: "anytime", from: { clay: 3 }, to: { stone: 2 } },
      { type: "conversion", id: "clay-4-stone-3", timing: "anytime", from: { clay: 4 }, to: { stone: 3 } },
    ],
  },
  "acorns-basket": {
    name: "橡果篮",
    sourceName: "Acorns Basket",
    effects: [{ type: "scheduleAnimals", trigger: "onPlay", schedule: { type: "relativeRounds", count: 2 }, animals: { boar: 1 } }],
  },
  bagpipe: {
    name: "风笛",
    sourceName: "Bagpipe",
    effects: [{ type: "gainResources", trigger: "harvestStart", resources: { food: 1 } }],
  },
  brooch: {
    name: "胸针",
    sourceName: "Brooch",
    effects: [{ type: "scoring", trigger: "scoring", rule: { type: "familySize", thresholds: [{ min: 2, points: 1 }, { min: 3, points: 2 }, { min: 4, points: 3 }, { min: 5, points: 4 }] } }],
  },
  "whisky-barrels": {
    name: "威士忌桶",
    sourceName: "Whisky Barrels",
    effects: [{ type: "scoring", trigger: "scoring", rule: { type: "playedRoundThreshold", thresholds: [{ maxRound: 6, points: 5 }, { maxRound: 8, points: 3 }, { maxRound: 10, points: 2 }, { maxRound: 12, points: 1 }] } }],
  },
  "highland-cattle": {
    name: "高地牛",
    sourceName: "Highland Cattle",
    effects: [{ type: "gainAnimals", trigger: "onPlay", animals: { cattle: 1 }, storeOnCard: true }],
  },
};

export const minorImprovements: MinorImprovementDefinition[] = minorImprovementBase
  .map((card) => ({ ...card, ...minorOverrides[card.id], effects: minorOverrides[card.id]?.effects ?? card.effects }))
  .filter((card) => card.implementationStatus !== "placeholder");

export function getMinorImprovement(cardId: string): MinorImprovementDefinition | undefined {
  return minorImprovements.find((card) => card.id === cardId);
}
