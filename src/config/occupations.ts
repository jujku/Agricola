import type { ResourceKey } from "./baseActions";
import type { CardEffect, CardEffectCategory, CardImplementationStatus } from "./minorImprovements";

export interface OccupationDefinition {
  id: string;
  name: string;
  sourceName?: string;
  deck: "A" | "B" | "C" | "D" | "unknown";
  minPlayers: number;
  cost: Partial<Record<ResourceKey, number>>;
  effectText: string;
  effectCategories: CardEffectCategory[];
  effects: CardEffect[];
  implementationStatus: CardImplementationStatus;
}

type OccupationSeed = Omit<OccupationDefinition, "cost" | "deck" | "effects" | "implementationStatus"> & {
  cost?: Partial<Record<ResourceKey, number>>;
  deck?: OccupationDefinition["deck"];
  effects?: CardEffect[];
  implementationStatus?: CardImplementationStatus;
};

function occupation(seed: OccupationSeed): OccupationDefinition {
  return {
    deck: seed.deck ?? "unknown",
    cost: seed.cost ?? {},
    effects: seed.effects ?? [],
    implementationStatus: seed.implementationStatus ?? "implemented",
    ...seed,
  };
}

const occupationBase: OccupationDefinition[] = [
  occupation({ id: "manservant", name: "Manservant", deck: "B", minPlayers: 1, effectCategories: ["roundStart"], effectText: "住进石屋后，在后续 3 个回合格各放 1 食物，回合开始时获得。" }),
  occupation({ id: "conservator", name: "Conservator", deck: "A", minPlayers: 1, effectCategories: ["costModifier"], effectText: "可以把木屋直接翻修成石屋，不必先翻成瓦房。" }),
  occupation({ id: "clay-hut-builder", name: "Clay Hut Builder", deck: "A", minPlayers: 1, effectCategories: ["roundStart"], effectText: "不再住木屋后，在后续 5 个回合格各放 2 黏土，回合开始时获得。" }),
  occupation({ id: "childless", name: "Childless", deck: "B", minPlayers: 1, effectCategories: ["roundStart"], effectText: "每回合开始时，若你有至少 3 间房但只有 2 个人，获得 1 食物和 1 作物。" }),
  occupation({ id: "priest", name: "Priest", deck: "A", minPlayers: 1, effectCategories: ["immediate"], effectText: "打出时，若住在恰好 2 间房的瓦房中，立即获得 3 黏土、2 芦苇和 2 石头。" }),
  occupation({ id: "animal-tamer", name: "Animal Tamer", deck: "A", minPlayers: 1, effectCategories: ["capacity", "immediate"], effectText: "打出时立即获得 1 木材或 1 谷物；屋内总共可以养 1 只动物。" }),
  occupation({ id: "hedge-keeper", name: "Hedge Keeper", deck: "A", minPlayers: 1, effectCategories: ["costModifier"], effectText: "每次执行建围栏行动时，最多 3 段围栏不用支付木材。" }),
  occupation({ id: "plow-driver", name: "Plow Driver", deck: "A", minPlayers: 1, effectCategories: ["roundStart"], effectText: "住进石屋后，每回合开始时可支付 1 食物翻耕 1 块田。" }),
  occupation({ id: "adoptive-parents", name: "Adoptive Parents", deck: "A", minPlayers: 1, effectCategories: ["actionBonus"], effectText: "支付 1 食物可在同一回合让新生家庭成员执行行动；该成员不算新生儿。" }),
  occupation({ id: "stable-architect", name: "Stable Architect", deck: "A", minPlayers: 1, effectCategories: ["scoring"], effectText: "计分时，每个未围起的马厩获得 1 奖励分。" }),
  occupation({ id: "grocer", name: "Grocer", deck: "A", minPlayers: 1, effectCategories: ["actionSpace"], effectText: "按卡面堆叠货物；任意时候可支付 1 食物购买最上方货物。" }),
  occupation({ id: "mushroom-collector", name: "Mushroom Collector", deck: "A", minPlayers: 1, effectCategories: ["actionBonus"], effectText: "每次使用木材累积格后，可以把 1 木材换成 2 食物，并把木材放回该累积格。" }),
  occupation({ id: "roughcaster", name: "Roughcaster", deck: "A", minPlayers: 1, effectCategories: ["actionBonus"], effectText: "每次用至少 1 黏土建造或从瓦房翻修到石屋时，额外获得 3 食物。" }),
  occupation({ id: "wall-builder", name: "Wall Builder", deck: "A", minPlayers: 1, effectCategories: ["roundStart"], effectText: "每次建至少 1 间房时，在后续 4 个回合格各放 1 食物，回合开始时获得。" }),
  occupation({ id: "scythe-worker", name: "Scythe Worker", deck: "A", minPlayers: 1, effectCategories: ["immediate", "harvest"], effectText: "打出时立即获得 1 谷物；每次收获可从每块谷物田额外收获 1 谷物。" }),
  occupation({ id: "seasonal-worker", name: "Seasonal Worker", deck: "A", minPlayers: 1, effectCategories: ["actionBonus"], effectText: "每次使用打零工行动格，额外获得 1 谷物；第 6 轮起可改为 1 蔬菜。" }),
  occupation({ id: "wood-cutter", name: "Wood Cutter", deck: "A", minPlayers: 1, effectCategories: ["actionBonus"], effectText: "每次使用木材累积格时，额外获得 1 木材。" }),
  occupation({ id: "firewood-collector", name: "Firewood Collector", deck: "A", minPlayers: 1, effectCategories: ["actionBonus"], effectText: "使用农田、谷物种子、耕种或谷物利用行动格时，回合结束获得 1 木材。" }),
  occupation({ id: "frame-builder", name: "Frame Builder", deck: "A", minPlayers: 1, effectCategories: ["costModifier"], effectText: "每次建房或翻修时，每个房间/行动只能用 1 木材替代恰好 2 黏土或 2 石头。" }),
  occupation({ id: "braggart", name: "Braggart", deck: "A", minPlayers: 3, effectCategories: ["scoring"], effectText: "计分时，根据面前设施数量至少 2/3/4/5/7/9 张，获得 1/2/3/4/5/9 奖励分。" }),
  occupation({ id: "harpooner", name: "Harpooner", deck: "A", minPlayers: 3, effectCategories: ["actionBonus"], effectText: "每次使用捕鱼累积格时，可支付 1 木材，为每个家庭成员获得 1 食物，并获得 1 芦苇。" }),
  occupation({ id: "stonecutter", name: "Stonecutter", deck: "A", minPlayers: 3, effectCategories: ["costModifier"], effectText: "每张设施和每次翻修少花 1 石头。" }),
  occupation({ id: "conjurer", name: "Conjurer", deck: "A", minPlayers: 4, effectCategories: ["actionBonus"], effectText: "每次使用巡回艺人累积格时，额外获得 1 木材和 1 谷物。" }),
  occupation({ id: "pig-breeder", name: "Pig Breeder", deck: "A", minPlayers: 4, effectCategories: ["immediate"], effectText: "打出时立即获得 1 野猪；你的野猪在第 12 轮末繁殖，若有空间则获得幼崽。" }),
  occupation({ id: "cottager", name: "Cottager", deck: "B", minPlayers: 1, effectCategories: ["actionBonus"], effectText: "使用打零工行动格时，也可以建造或翻修恰好 1 间房，并支付对应成本。" }),
  occupation({ id: "groom", name: "Groom", deck: "B", minPlayers: 1, effectCategories: ["immediate", "roundStart"], effectText: "打出时获得 1 木材；住进石屋后，每回合开始时可用 1 木材建造恰好 1 个马厩。" }),
  occupation({ id: "assistant-tiller", name: "Assistant Tiller", deck: "B", minPlayers: 1, effectCategories: ["actionBonus"], effectText: "每次使用打零工行动格时，也可以翻耕 1 块田。" }),
  occupation({ id: "master-bricklayer", name: "Master Bricklayer", deck: "B", minPlayers: 1, effectCategories: ["costModifier"], effectText: "每次购买大设施时，按已经建在初始房屋上的房间数减少石头成本。" }),
  occupation({ id: "scholar", name: "Scholar", deck: "B", minPlayers: 1, effectCategories: ["roundStart"], effectText: "住进石屋后，每回合开始时可支付 1 食物打出职业卡，或按成本打出小设施。" }),
  occupation({ id: "organic-farmer", name: "Organic Farmer", deck: "B", minPlayers: 1, effectCategories: ["scoring"], effectText: "计分时，每个至少有 1 动物的牧场得 1 奖励分；若至少还有 3 只动物额外加分。" }),
  occupation({ id: "tutor", name: "Tutor", deck: "B", minPlayers: 1, effectCategories: ["scoring"], effectText: "计分时，本职业之后打出的每张职业卡获得 1 奖励分。" }),
  occupation({ id: "consultant", name: "Consultant", deck: "B", minPlayers: 1, effectCategories: ["immediate"], effectText: "在 1/2/3/4 人游戏打出时，立即获得 2 谷物 / 3 黏土 / 2 芦苇 / 2 羊。" }),
  occupation({ id: "sheep-walker", name: "Sheep Walker", deck: "B", minPlayers: 1, effectCategories: ["conversion"], effectText: "任意时候，可用 1 羊换 1 野猪、1 蔬菜或 1 石头。" }),
  occupation({ id: "oven-firing-boy", name: "Oven Firing Boy", deck: "B", minPlayers: 1, effectCategories: ["actionBonus"], effectText: "每次使用木材累积格时，额外获得一次烤面包行动。" }),
  occupation({ id: "paper-maker", name: "Paper Maker", deck: "B", minPlayers: 1, effectCategories: ["costModifier"], effectText: "每次在本牌后打出职业卡前，可支付 1 木材，为面前每张职业卡获得 1 食物。" }),
  occupation({ id: "small-scale-farmer", name: "Small-Scale Farmer", deck: "B", minPlayers: 1, effectCategories: ["roundStart"], effectText: "只要你住在恰好 2 间房的房屋中，每回合开始获得 1 木材。" }),
  occupation({ id: "geologist", name: "Geologist", deck: "B", minPlayers: 1, effectCategories: ["actionBonus"], effectText: "每次使用森林或芦苇滩累积格时，额外获得 1 黏土；3 人及以上另在黏土坑放 1 黏土。" }),
  occupation({ id: "roof-ballaster", name: "Roof Ballaster", deck: "B", minPlayers: 1, effectCategories: ["immediate"], effectText: "打出时，按每间房获得 1 食物，可用于购买 1 石头。" }),
  occupation({ id: "carpenter", name: "Carpenter", deck: "B", minPlayers: 1, effectCategories: ["costModifier"], effectText: "每个新房间只消耗对应建筑资源 3 个和 2 芦苇。" }),
  occupation({ id: "house-steward", name: "House Steward", deck: "B", minPlayers: 3, effectCategories: ["immediate", "scoring"], effectText: "若仍有 1/3/6/9 个完整回合未开始，立即获得 1/2/3/4 木材；计分时房间最多者得 3 奖励分。" }),
  occupation({ id: "greengrocer", name: "Greengrocer", deck: "B", minPlayers: 3, effectCategories: ["actionBonus"], effectText: "每次使用谷物种子行动格时，也获得 1 蔬菜。" }),
  occupation({ id: "brushwood-collector", name: "Brushwood Collector", deck: "B", minPlayers: 3, effectCategories: ["costModifier"], effectText: "每次翻修或建房时，可以用总共 1 木材代替所需的 1 或 2 芦苇。" }),
  occupation({ id: "storehouse-keeper", name: "Storehouse Keeper", deck: "B", minPlayers: 4, effectCategories: ["actionBonus"], effectText: "每次使用资源市场行动格时，也获得 1 黏土或 1 谷物。" }),
  occupation({ id: "pastor", name: "Pastor", deck: "B", minPlayers: 4, effectCategories: ["immediate"], effectText: "一旦你是唯一一个仍只住 2 间房的玩家，立即获得 3 木材、2 黏土、1 芦苇和 1 石头。" }),
  occupation({ id: "sheep-whisperer", name: "Sheep Whisperer", deck: "B", minPlayers: 4, effectCategories: ["roundStart"], effectText: "在第 2、5、8、10 轮各放 1 羊；这些回合开始时获得该羊。" }),
  occupation({ id: "cattle-feeder", name: "Cattle Feeder", deck: "B", minPlayers: 4, effectCategories: ["actionBonus"], effectText: "每次使用谷物种子行动格时，可支付 1 食物购买 1 牛。" }),
  occupation({ id: "animal-dealer", name: "Animal Dealer", deck: "A", minPlayers: 3, effectCategories: ["actionBonus"], effectText: "每次使用羊/猪/牛市场累积格时，可支付 1 食物购买 1 只对应动物。" }),
  occupation({ id: "lutenist", name: "Lutenist", deck: "A", minPlayers: 4, effectCategories: ["actionBonus"], effectText: "每次其他玩家使用巡回艺人累积格时，你获得 1 食物；随后可用 2 食物购买 1 蔬菜。" }),
  occupation({ id: "off-sitter", name: "Off-Sitter", deck: "A", minPlayers: 5, effectCategories: ["capacity"], effectText: "当你拥有全部大设施的印刷建筑资源成本至少 9 时，本牌为剩余游戏提供 1 人住房容量。" }),
  occupation({ id: "hayward", name: "Hayward", deck: "A", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "可以不放置工人而建围栏；这仍视为一次建围栏行动。" }),
  occupation({ id: "sidekick", name: "Sidekick", deck: "A", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次你在行动格放置工人后，可把另一个工人立即放到左侧相邻行动格。" }),
  occupation({ id: "boat-painter", name: "Boat Painter", deck: "A", minPlayers: 5, effectCategories: ["roundStart"], effectText: "每个工作阶段结束时，若捕鱼和巡回艺人都被占用，获得 1 谷物或 2 食物。" }),
  occupation({ id: "clay-thief", name: "Clay Thief", deck: "A", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "本局一次，在工作阶段开始时，可翻面拿走黏土洼地行动格上的全部黏土。" }),
  occupation({ id: "master-hora", name: "Master Hora", deck: "A", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次放到带沙漏符号的行动格前，可购买 1 蔬菜，价格 1 食物。" }),
  occupation({ id: "hollow-gardener", name: "Hollow Gardener", deck: "A", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次从黏土洼地拿至少 3 黏土时，也获得 1 谷物；若拿至少 6 黏土，改为 1 蔬菜。" }),
  occupation({ id: "wheelmaker", name: "Wheelmaker", deck: "A", minPlayers: 5, effectCategories: ["roundStart"], effectText: "打出时，若其他玩家拥有更多职业且更多木材，立即从公共供应获得木材直到你有 15 木材。" }),
  occupation({ id: "middleman", name: "Middleman", deck: "A", minPlayers: 5, effectCategories: ["actionSpace"], effectText: "在所有带箭头的行动格上各放 1 石头和 1 食物；下次有人放工人时获得这些货物。" }),
  occupation({ id: "carpenters-boy", name: "Carpenter's Boy", deck: "A", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次其他玩家建房时，立即获得 1 木材。" }),
  occupation({ id: "mountain-shepherd", name: "Mountain Shepherd", deck: "A", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次使用任一采石场累积格时，额外从公共供应获得 1 羊。" }),
  occupation({ id: "animal-brander", name: "Animal Brander", deck: "A", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次使用动物市场行动格时，可支付 1 食物连续两次使用同一个选项。" }),
  occupation({ id: "livestock-sustainer", name: "Livestock Sustainer", deck: "B", minPlayers: 5, effectCategories: ["capacity"], effectText: "其他玩家建造的每个大设施可以放 1 只你的动物，最多 8 只，且种类不能重复。" }),
  occupation({ id: "corral-builder", name: "Corral Builder", deck: "B", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "猪市场和牛市场行动格作为回合卡翻出时，可以立即免费围起恰好 1 个农场格。" }),
  occupation({ id: "greenhouse-builder", name: "Greenhouse Builder", deck: "B", minPlayers: 5, effectCategories: ["actionSpace"], effectText: "这是只供你使用的行动格，提供已在场的围栏/房屋翻修/蔬菜种子之一。" }),
  occupation({ id: "cattle-caregiver", name: "Cattle Caregiver", deck: "B", minPlayers: 5, effectCategories: ["roundStart"], effectText: "每回合开始时，若 3/4/5 名玩家各至少有 1 牛，获得 1/2/3 食物。" }),
  occupation({ id: "sweeper", name: "Sweeper", deck: "B", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次使用带扫帚符号的行动格，在本牌放 1 食物；本局一次可翻面取得这些食物。" }),
  occupation({ id: "riverbank-gardener", name: "Riverbank Gardener", deck: "B", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次使用河岸林累积格时，也获得 1 蔬菜。" }),
  occupation({ id: "field-overseer", name: "Field Overseer", deck: "B", minPlayers: 5, effectCategories: ["harvest"], effectText: "每次其他玩家从至少 3/4/6 块田收获谷物时，你获得 1 食物/谷物/蔬菜。" }),
  occupation({ id: "village-idiot", name: "Village Idiot", deck: "B", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "这是你的单人职业；每次其他玩家使用广场行动格，你获得 1 木材和 1 食物。" }),
  occupation({ id: "stone-clawer", name: "Stone Clawer", deck: "B", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次翻耕至少 1 块田时，也获得 1 石头。" }),
  occupation({ id: "tag-along", name: "Tag-Along", deck: "B", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次其他玩家使用资源市场行动格时，你也可以放置工人执行该行动。" }),
  occupation({ id: "wild-boar-hunter", name: "Wild Boar Hunter", deck: "B", minPlayers: 5, effectCategories: ["roundStart"], effectText: "每回合回家阶段，若 3 个木材累积格都被占用，可支付 1 木材获得 1 野猪。" }),
  occupation({ id: "game-taster", name: "Game Taster", deck: "B", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次从食物累积格拿 1/2/3 食物时，也获得 1 牛/野猪/羊。" }),
  occupation({ id: "fast-mason", name: "Fast Mason", deck: "C", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次使用黏土/石头累积格后，可不付芦苇将房屋翻修到瓦房/石屋。" }),
  occupation({ id: "amateur-fencer", name: "Amateur Fencer", deck: "C", minPlayers: 5, effectCategories: ["immediate"], effectText: "打出时，若还没有牧场，可立即免费围起自己农场中的恰好 1 个格子。" }),
  occupation({ id: "young-artist", name: "Young Artist", deck: "C", minPlayers: 5, effectCategories: ["roundStart"], effectText: "每回合回家阶段，可支付 1 食物抽 1 张小设施，或支付 1 食物抽 2 张新小设施。" }),
  occupation({ id: "field-counter", name: "Field Counter", deck: "C", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次其他玩家翻田时，在本牌放 1 食物；本局一次可翻面取得这些食物。" }),
  occupation({ id: "top-outer", name: "Top-Outer", deck: "C", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次使用带方框扩展的建房行动格时，获得巡回艺人累积格上的全部食物。" }),
  occupation({ id: "stone-custodian", name: "Stone Custodian", deck: "C", minPlayers: 5, effectCategories: ["roundStart"], effectText: "每个工作阶段结束时，若 1 个石头累积格有石头，获得 1 谷物；若 2 个都有，改为 1 蔬菜。" }),
  occupation({ id: "village-teacher", name: "Village Teacher", deck: "C", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次使用课程行动格后，若它是第 1/2/3 个被占用的课程格，获得 1 食物/谷物/蔬菜。" }),
  occupation({ id: "cleanacre", name: "Cleanacre", deck: "C", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次使用农田、耕种或农耕补给行动格时，也获得 2 黏土。" }),
  occupation({ id: "mountain-hiker", name: "Mountain Hiker", deck: "C", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次使用扩展板上的累积格后，可以用 1 食物购买 1 石头。" }),
  occupation({ id: "on-site-reverend", name: "On-Site Reverend", deck: "C", minPlayers: 5, effectCategories: ["harvest"], effectText: "每次收获开始时，获得 1 个任意建筑资源。" }),
  occupation({ id: "bovine-pioneer", name: "Bovine Pioneer", deck: "C", minPlayers: 5, effectCategories: ["immediate"], effectText: "每次建造至少 1 个新牧场，且牧场中以前没有围过农场格，获得 1 牛。" }),
  occupation({ id: "trapper", name: "Trapper", deck: "C", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次使用木材累积格后，若这是本轮第 2/3/4 个被占用的木材累积格，可用 1 食物买 1 羊/野猪/牛。" }),
  occupation({ id: "plowsmith", name: "Plowsmith", deck: "D", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次其他玩家从累积格拿至少 4 木材，可立即支付 1 食物翻耕 1 块田。" }),
  occupation({ id: "fold-builder", name: "Fold Builder", deck: "D", minPlayers: 5, effectCategories: ["actionSpace"], effectText: "这是所有玩家可用的行动格：建围栏并获得 1 羊；他人使用时必须先给你 1 食物。" }),
  occupation({ id: "senior-teacher", name: "Senior Teacher", deck: "D", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次其他玩家在课程行动格支付食物时，你获得恰好 1 个该食物。" }),
  occupation({ id: "putcher-maker", name: "Putcher Maker", deck: "D", minPlayers: 5, effectCategories: ["conversion"], effectText: "任意时候，可以用 1 芦苇换 2 食物。" }),
  occupation({ id: "town-clerk", name: "Town Clerk", deck: "D", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次建造大设施时，在本牌放 1 食物；本局一次可翻面取得这些食物。" }),
  occupation({ id: "loess-gardener", name: "Loess Gardener", deck: "D", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次使用黏土坑累积格时，也可以用 1 食物购买 1 蔬菜。" }),
  occupation({ id: "countryman", name: "Countryman", deck: "D", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "任意玩家（包括你）使用翻修行动格时，你可以在恰好 1 块田中播种。" }),
  occupation({ id: "woodshacker", name: "Woodshacker", deck: "D", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每个工作阶段，第一次和第二次使用木材累积格后，也分别获得 1 黏土和 2 黏土。" }),
  occupation({ id: "graduate", name: "Graduate", deck: "D", minPlayers: 5, effectCategories: ["immediate"], effectText: "打出时立即支付 1 食物；若支付，获得 2 石头和 2 芦苇。" }),
  occupation({ id: "substitute-teacher", name: "Substitute Teacher", deck: "D", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次所有三个课程行动格都被占用时，可使用本牌用 1 建筑资源或 1 作物打出 1 职业卡。" }),
  occupation({ id: "bullcatcher", name: "Bullcatcher", deck: "D", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "当第 3 和第 6 回合卡上的两个行动格都被占用时，可使用本牌支付 1 人、获得 1 牛和 2 食物。" }),
  occupation({ id: "part-time-worker", name: "Part-Time Worker", deck: "D", minPlayers: 5, effectCategories: ["actionBonus"], effectText: "每次使用正好有 2/4/6 个货物的累积格时，可留下 1/2/3 个货物；若如此，获得 1 羊/野猪/牛。" }),
  occupation({ id: "hidden-occupation", name: "隐藏职业", deck: "unknown", minPlayers: 1, effectCategories: [], implementationStatus: "placeholder", effectText: "隐藏职业卡，效果未知；仅用于参考追踪，不进入正常牌组。" }),
];

const occupationOverrides: Record<string, Partial<OccupationDefinition>> = {
  manservant: {
    name: "男仆",
    sourceName: "Manservant",
    effects: [{ type: "scheduleResources", trigger: "roundStart", schedule: { type: "relativeRounds", count: 3 }, resources: { food: 1 }, condition: { type: "roomMaterial", materials: ["stone"] } }],
  },
  conservator: {
    name: "修缮师",
    sourceName: "Conservator",
    effects: [{ type: "costModifier", scope: "renovation", renovationTarget: "stone" }],
  },
  "clay-hut-builder": {
    name: "泥屋建筑师",
    sourceName: "Clay Hut Builder",
    effects: [{ type: "scheduleResources", trigger: "roundStart", schedule: { type: "relativeRounds", count: 5 }, resources: { clay: 2 }, condition: { type: "roomMaterial", materials: ["clay", "stone"] } }],
  },
  childless: {
    name: "无子者",
    sourceName: "Childless",
    effects: [{ type: "gainResources", trigger: "roundStart", resources: { food: 1, grain: 1 }, condition: { type: "allOf", conditions: [{ type: "roomsAtLeast", count: 3 }, { type: "workersExactly", count: 2 }] } }],
  },
  priest: {
    name: "牧师",
    sourceName: "Priest",
    effects: [{ type: "gainResources", trigger: "onPlay", resources: { clay: 3, reed: 2, stone: 2 }, condition: { type: "allOf", conditions: [{ type: "roomMaterial", materials: ["clay"] }, { type: "roomsExactly", count: 2 }] } }],
  },
  "animal-tamer": {
    name: "驯兽师",
    sourceName: "Animal Tamer",
    effects: [{ type: "gainResources", trigger: "onPlay", resources: { wood: 1 } }, { type: "capacity", scope: "houseAnimals", amount: 1 }],
  },
  "hedge-keeper": {
    name: "树篱管理员",
    sourceName: "Hedge Keeper",
    effects: [{ type: "costModifier", scope: "buildFence", resource: "wood", discount: 3 }],
  },
  "plow-driver": {
    name: "犁夫",
    sourceName: "Plow Driver",
    effects: [{ type: "plowField", trigger: "roundStart", amount: 1, cost: { food: 1 }, condition: { type: "roomMaterial", materials: ["stone"] } }],
  },
  "adoptive-parents": {
    name: "养父母",
    sourceName: "Adoptive Parents",
    effects: [{ type: "actionAccess", access: "immediateNewborn" }],
  },
  "stable-architect": {
    name: "马厩建筑师",
    sourceName: "Stable Architect",
    effects: [{ type: "scoring", trigger: "scoring", rule: { type: "unfencedStables", pointsEach: 1 } }],
  },
  grocer: { name: "杂货商", sourceName: "Grocer", effects: [{ type: "buyGoods", trigger: "roundStart", cost: { food: 1 }, goods: { grain: 1 } }] },
  "mushroom-collector": {
    name: "采蘑菇者",
    sourceName: "Mushroom Collector",
    effects: [{ type: "returnAccumulatedResource", trigger: "afterAction", resource: "wood", amount: 1, gainFood: 2, condition: { type: "actionGroup", groups: ["woodAccumulation"] } }],
  },
  roughcaster: {
    name: "抹灰工",
    sourceName: "Roughcaster",
    effects: [
      { type: "gainResources", trigger: "afterAction", resources: { food: 3 }, condition: { type: "anyOf", conditions: [{ type: "builtRoomsWithMaterial", material: "clay" }, { type: "renovatedFromTo", from: "clay", to: "stone" }] } },
    ],
  },
  "wall-builder": {
    name: "砌墙工",
    sourceName: "Wall Builder",
    effects: [{ type: "scheduleResources", trigger: "afterAction", schedule: { type: "relativeRounds", count: 4 }, resources: { food: 1 }, condition: { type: "selectedEffectType", types: ["buildRooms"] } }],
  },
  "scythe-worker": {
    name: "镰刀工",
    sourceName: "Scythe Worker",
    effects: [{ type: "gainResources", trigger: "onPlay", resources: { grain: 1 } }, { type: "gainResourcesByFields", trigger: "harvestField", crop: "grain", resourcesPerField: { grain: 1 } }],
  },
  "seasonal-worker": {
    name: "季节工",
    sourceName: "Seasonal Worker",
    effects: [
      { type: "gainResources", trigger: "afterAction", resources: { grain: 1 }, condition: { type: "allOf", conditions: [{ type: "actionGroup", groups: ["dayLaborer"] }, { type: "roundAtMost", round: 5 }] } },
      { type: "gainResources", trigger: "afterAction", resources: { vegetable: 1 }, condition: { type: "allOf", conditions: [{ type: "actionGroup", groups: ["dayLaborer"] }, { type: "roundAtLeast", round: 6 }] } },
    ],
  },
  "wood-cutter": {
    name: "伐木工",
    sourceName: "Wood Cutter",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { wood: 1 }, condition: { type: "actionGroup", groups: ["woodAccumulation"] } }],
  },
  "firewood-collector": {
    name: "柴火收集者",
    sourceName: "Firewood Collector",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { wood: 1 }, condition: { type: "actionGroup", groups: ["fieldActions", "grainSeeds", "sow"] } }],
  },
  "frame-builder": {
    name: "框架建筑师",
    sourceName: "Frame Builder",
    effects: [{ type: "costModifier", scope: "buildRoom", substitute: { from: "clay", to: "wood", ratio: 2 } }, { type: "costModifier", scope: "renovation", substitute: { from: "stone", to: "wood", ratio: 2 } }],
  },
  braggart: {
    name: "吹牛者",
    sourceName: "Braggart",
    effects: [{ type: "scoring", trigger: "scoring", rule: { type: "playedImprovements", thresholds: [{ min: 2, points: 1 }, { min: 3, points: 2 }, { min: 4, points: 3 }, { min: 5, points: 4 }, { min: 7, points: 5 }, { min: 9, points: 9 }] } }],
  },
  harpooner: {
    name: "鱼叉手",
    sourceName: "Harpooner",
    effects: [{ type: "gainResourcesByFamilyMembers", trigger: "afterAction", cost: { wood: 1 }, resourcesPerWorker: { food: 1 }, resources: { reed: 1 }, condition: { type: "actionGroup", groups: ["fishing"] } }],
  },
  stonecutter: {
    name: "石匠",
    sourceName: "Stonecutter",
    effects: [{ type: "costModifier", scope: "majorImprovement", resource: "stone", discount: 1 }, { type: "costModifier", scope: "minorImprovement", resource: "stone", discount: 1 }, { type: "costModifier", scope: "renovation", resource: "stone", discount: 1 }],
  },
  conjurer: {
    name: "魔术师",
    sourceName: "Conjurer",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { wood: 1, grain: 1 }, condition: { type: "actionGroup", groups: ["travelingPlayers"] } }],
  },
  "pig-breeder": {
    name: "养猪人",
    sourceName: "Pig Breeder",
    effects: [{ type: "gainAnimals", trigger: "onPlay", animals: { boar: 1 } }, { type: "scheduleAnimals", trigger: "onPlay", schedule: { type: "fixedRounds", rounds: [12] }, animals: { boar: 1 } }],
  },
  cottager: {
    name: "小屋农夫",
    sourceName: "Cottager",
    effects: [{ type: "buildRoomOrRenovate", trigger: "afterAction", condition: { type: "actionGroup", groups: ["dayLaborer"] } }],
  },
  groom: {
    name: "马夫",
    sourceName: "Groom",
    effects: [{ type: "gainResources", trigger: "onPlay", resources: { wood: 1 } }, { type: "buildStable", trigger: "roundStart", amount: 1, cost: { wood: 1 }, condition: { type: "roomMaterial", materials: ["stone"] } }],
  },
  "assistant-tiller": {
    name: "助耕者",
    sourceName: "Assistant Tiller",
    effects: [{ type: "plowField", trigger: "afterAction", amount: 1, condition: { type: "actionGroup", groups: ["dayLaborer"] } }],
  },
  "master-bricklayer": {
    name: "砖瓦大师",
    sourceName: "Master Bricklayer",
    effects: [{ type: "costModifier", scope: "majorImprovement", resource: "stone", discount: 1, discountByInitialRooms: true }],
  },
  scholar: {
    name: "学者",
    sourceName: "Scholar",
    effects: [{ type: "autoPlayCard", trigger: "roundStart", kind: "occupationOrMinorImprovement", cost: { food: 1 }, condition: { type: "roomMaterial", materials: ["stone"] } }],
  },
  "organic-farmer": {
    name: "有机农夫",
    sourceName: "Organic Farmer",
    effects: [{ type: "scoring", trigger: "scoring", rule: { type: "pasturesWithAnimals", pointsEach: 1, extraIfAnimalsAtLeast: { count: 3, points: 1 } } }],
  },
  tutor: {
    name: "家庭教师",
    sourceName: "Tutor",
    effects: [{ type: "scoring", trigger: "scoring", rule: { type: "playedOccupationsAfterThis", pointsEach: 1 } }],
  },
  consultant: {
    name: "顾问",
    sourceName: "Consultant",
    effects: [{ type: "gainPlayerCountResources", trigger: "onPlay", byPlayerCount: { 1: { grain: 2 }, 2: { clay: 3 }, 3: { reed: 2 }, 4: { sheep: 2 } } }],
  },
  "sheep-walker": {
    name: "赶羊人",
    sourceName: "Sheep Walker",
    effects: [
      { type: "conversion", id: "sheep-to-boar", timing: "anytime", from: { sheep: 1 }, to: { boar: 1 } },
      { type: "conversion", id: "sheep-to-vegetable", timing: "anytime", from: { sheep: 1 }, to: { vegetable: 1 } },
      { type: "conversion", id: "sheep-to-stone", timing: "anytime", from: { sheep: 1 }, to: { stone: 1 } },
    ],
  },
  "oven-firing-boy": {
    name: "烤炉童工",
    sourceName: "Oven Firing Boy",
    effects: [{ type: "bakeBread", trigger: "afterAction", condition: { type: "actionGroup", groups: ["woodAccumulation"] } }],
  },
  "paper-maker": {
    name: "造纸人",
    sourceName: "Paper Maker",
    effects: [{ type: "gainResourcesByPlayedCardCount", trigger: "afterAction", cardKind: "occupation", resourcesPerCard: { food: 1 }, cost: { wood: 1 }, countSource: "actorBefore", condition: { type: "actionGroup", groups: ["lessons"] } }],
  },
  "small-scale-farmer": {
    name: "小农",
    sourceName: "Small-Scale Farmer",
    effects: [{ type: "gainResources", trigger: "roundStart", resources: { wood: 1 }, condition: { type: "roomsExactly", count: 2 } }],
  },
  geologist: {
    name: "地质学家",
    sourceName: "Geologist",
    effects: [
      { type: "gainResources", trigger: "afterAction", resources: { clay: 1 }, condition: { type: "actionId", ids: ["forest", "reed-bank"] } },
      { type: "addAccumulated", trigger: "afterAction", actionSpaceIds: ["clay-pit"], resources: { clay: 1 }, condition: { type: "allOf", conditions: [{ type: "actionId", ids: ["forest", "reed-bank"] }, { type: "playerCountAtLeast", count: 3 }] } },
    ],
  },
  "roof-ballaster": {
    name: "压顶工",
    sourceName: "Roof Ballaster",
    effects: [{ type: "gainResourcesByRooms", trigger: "onPlay", resourcesPerRoom: { food: 1 } }],
  },
  carpenter: {
    name: "木匠",
    sourceName: "Carpenter",
    effects: [{ type: "costModifier", scope: "buildRoom", fixedRoomCost: { wood: 3, clay: 3, stone: 3, reed: 2 } }],
  },
  "house-steward": {
    name: "房屋管理员",
    sourceName: "House Steward",
    effects: [{ type: "gainResourcesByConditionCount", trigger: "onPlay", count: { type: "remainingRounds" }, thresholds: [{ min: 1, max: 2, resources: { wood: 1 } }, { min: 3, max: 5, resources: { wood: 2 } }, { min: 6, max: 8, resources: { wood: 3 } }, { min: 9, resources: { wood: 4 } }] }, { type: "scoring", trigger: "scoring", rule: { type: "roomLeader", points: 3 } }],
  },
  greengrocer: {
    name: "菜贩",
    sourceName: "Greengrocer",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { vegetable: 1 }, condition: { type: "actionGroup", groups: ["grainSeeds"] } }],
  },
  "brushwood-collector": {
    name: "柴枝收集者",
    sourceName: "Brushwood Collector",
    effects: [{ type: "costModifier", scope: "buildRoom", resource: "reed", discount: 1 }, { type: "costModifier", scope: "renovation", resource: "reed", discount: 1 }],
  },
  "storehouse-keeper": {
    name: "仓库管理员",
    sourceName: "Storehouse Keeper",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { clay: 1 }, condition: { type: "actionGroup", groups: ["resourceMarket"] } }],
  },
  pastor: {
    name: "乡村牧师",
    sourceName: "Pastor",
    effects: [{ type: "gainResources", trigger: "roundStart", resources: { wood: 3, clay: 2, reed: 1, stone: 1 }, once: true, condition: { type: "uniquePlayerWithRoomsExactly", count: 2 } }],
  },
  "sheep-whisperer": {
    name: "羊语者",
    sourceName: "Sheep Whisperer",
    effects: [{ type: "scheduleAnimals", trigger: "onPlay", schedule: { type: "fixedRounds", rounds: [2, 5, 8, 10] }, animals: { sheep: 1 } }],
  },
  "cattle-feeder": {
    name: "喂牛人",
    sourceName: "Cattle Feeder",
    effects: [{ type: "gainAnimals", trigger: "afterAction", animals: { cattle: 1 }, cost: { food: 1 }, condition: { type: "actionGroup", groups: ["grainSeeds"] } }],
  },
  "animal-dealer": {
    name: "牲畜贩",
    sourceName: "Animal Dealer",
    effects: [
      { type: "gainAnimals", trigger: "afterAction", animals: { sheep: 1 }, cost: { food: 1 }, condition: { type: "actionId", ids: ["sheep-market"] } },
      { type: "gainAnimals", trigger: "afterAction", animals: { boar: 1 }, cost: { food: 1 }, condition: { type: "actionId", ids: ["boar-market"] } },
      { type: "gainAnimals", trigger: "afterAction", animals: { cattle: 1 }, cost: { food: 1 }, condition: { type: "actionId", ids: ["cattle-market"] } },
    ],
  },
  lutenist: {
    name: "鲁特琴手",
    sourceName: "Lutenist",
    effects: [
      { type: "gainResources", trigger: "afterAction", resources: { food: 1 }, condition: { type: "actionGroup", groups: ["travelingPlayers"], actor: "other" } },
      { type: "buyGoods", trigger: "afterAction", cost: { food: 2 }, goods: { vegetable: 1 }, condition: { type: "actionGroup", groups: ["travelingPlayers"], actor: "other" } },
    ],
  },
  "off-sitter": {
    name: "代看者",
    sourceName: "Off-Sitter",
    effects: [{ type: "capacity", scope: "housing", amount: 1, condition: { type: "ownedMajorImprovementCostAtLeast", count: 9, resources: ["wood", "clay", "reed", "stone"] } }],
  },
  hayward: { name: "牧场看守", sourceName: "Hayward", effects: [{ type: "actionAccess", access: "freeFenceAction" }] },
  sidekick: { name: "助手", sourceName: "Sidekick", effects: [{ type: "actionAccess", access: "keepTurnAfterAnyAction" }] },
  "boat-painter": {
    name: "船漆工",
    sourceName: "Boat Painter",
    effects: [{ type: "gainResources", trigger: "returnHome", resources: { grain: 1 }, condition: { type: "actionSpacesOccupied", ids: ["fishing", "five-build-room-traveling"] } }],
  },
  "clay-thief": { name: "黏土贼", sourceName: "Clay Thief", effects: [{ type: "claimAccumulated", trigger: "roundStart", actionSpaceId: "five-hollow", resource: "clay", once: true }] },
  "master-hora": { name: "霍拉大师", sourceName: "Master Hora", effects: [{ type: "buyGoods", trigger: "afterAction", cost: { food: 1 }, goods: { vegetable: 1 } }] },
  "hollow-gardener": {
    name: "洼地园丁",
    sourceName: "Hollow Gardener",
    effects: [{ type: "gainResourcesByConditionCount", trigger: "afterAction", count: { type: "accumulatedTaken", resource: "clay" }, thresholds: [{ min: 3, max: 5, resources: { grain: 1 } }, { min: 6, resources: { vegetable: 1 } }], condition: { type: "actionId", ids: ["five-hollow"] } }],
  },
  wheelmaker: {
    name: "车轮匠",
    sourceName: "Wheelmaker",
    effects: [{ type: "gainResourceUpTo", trigger: "onPlay", resource: "wood", targetAmount: 15, condition: { type: "otherPlayerHasMore", metrics: [{ type: "occupations" }, { type: "resource", resource: "wood" }] } }],
  },
  middleman: {
    name: "中间商",
    sourceName: "Middleman",
    effects: [
      { type: "addAccumulated", trigger: "onPlay", actionSpaceIds: ["major-minor-improvement", "house-redevelopment", "family-growth-room", "five-build-room-traveling"], resources: { stone: 1, food: 1 } },
      { type: "claimAccumulated", trigger: "afterAction", resource: "stone", target: "actor", condition: { type: "actionId", ids: ["major-minor-improvement", "house-redevelopment", "family-growth-room", "five-build-room-traveling"], actor: "any" } },
      { type: "claimAccumulated", trigger: "afterAction", resource: "food", target: "actor", condition: { type: "actionId", ids: ["major-minor-improvement", "house-redevelopment", "family-growth-room", "five-build-room-traveling"], actor: "any" } },
    ],
  },
  "carpenters-boy": {
    name: "木匠学徒",
    sourceName: "Carpenter's Boy",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { wood: 1 }, condition: { type: "actionGroup", groups: ["building"], actor: "other" } }],
  },
  "mountain-shepherd": {
    name: "山地牧羊人",
    sourceName: "Mountain Shepherd",
    effects: [{ type: "gainAnimals", trigger: "afterAction", animals: { sheep: 1 }, condition: { type: "actionGroup", groups: ["stoneAccumulation"] } }],
  },
  "animal-brander": { name: "烙印师", sourceName: "Animal Brander", effects: [{ type: "actionAccess", access: "doubleAnimalMarket" }] },
  "livestock-sustainer": {
    name: "牲畜寄养人",
    sourceName: "Livestock Sustainer",
    effects: [{ type: "capacity", scope: "cardAnimals", amount: 8 }],
  },
  "corral-builder": {
    name: "畜栏建造者",
    sourceName: "Corral Builder",
    effects: [{ type: "createFreePasture", trigger: "roundStart", cells: 1, condition: { type: "roundCardRevealed", ids: ["boar-market", "cattle-market"] } }],
  },
  "greenhouse-builder": { name: "温室建造者", sourceName: "Greenhouse Builder", effects: [{ type: "createActionSpace", trigger: "onPlay", id: "private-greenhouse-builder", name: "私人温室", visibility: "private", effects: [{ type: "gainResource", resource: "vegetable", amount: 1 }] }] },
  "cattle-caregiver": {
    name: "牛照料者",
    sourceName: "Cattle Caregiver",
    effects: [{ type: "gainResourcesByConditionCount", trigger: "roundStart", count: { type: "playersWithAnimalAtLeast", animal: "cattle", count: 1 }, thresholds: [{ min: 3, resources: { food: 1 } }, { min: 4, resources: { food: 2 } }, { min: 5, resources: { food: 3 } }] }],
  },
  sweeper: {
    name: "清扫工",
    sourceName: "Sweeper",
    effects: [
      { type: "storeGoods", trigger: "afterAction", resources: { food: 1 }, condition: { type: "actionGroup", groups: ["building", "fieldActions"] } },
      { type: "claimStoredGoods", trigger: "returnHome", once: true },
    ],
  },
  "riverbank-gardener": {
    name: "河岸园丁",
    sourceName: "Riverbank Gardener",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { vegetable: 1 }, condition: { type: "actionId", ids: ["five-riverbank-forest"] } }],
  },
  "field-overseer": {
    name: "田地监工",
    sourceName: "Field Overseer",
    effects: [{ type: "gainResourcesForEachConditionCount", trigger: "harvestField", count: { type: "harvestedCropFields", crop: "grain", actor: "other" }, thresholds: [{ min: 3, max: 3, resources: { food: 1 } }, { min: 4, max: 5, resources: { grain: 1 } }, { min: 6, resources: { vegetable: 1 } }] }],
  },
  "village-idiot": {
    name: "村傻",
    sourceName: "Village Idiot",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { wood: 1, food: 1 }, condition: { type: "actionId", ids: ["meeting-place"], actor: "other" } }],
  },
  "stone-clawer": {
    name: "抓石工",
    sourceName: "Stone Clawer",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { stone: 1 }, condition: { type: "actionGroup", groups: ["plow"] } }],
  },
  "tag-along": {
    name: "跟随者",
    sourceName: "Tag-Along",
    effects: [
      { type: "gainResources", trigger: "afterAction", resources: { reed: 1, stone: 1, wood: 1 }, condition: { type: "actionId", ids: ["five-resource-market"], actor: "other" } },
      { type: "gainResources", trigger: "afterAction", resources: { reed: 1, wood: 1, food: 1 }, condition: { type: "actionId", ids: ["six-building-supplies"], actor: "other" } },
      { type: "gainResources", trigger: "afterAction", resources: { stone: 1, food: 1 }, condition: { type: "allOf", conditions: [{ type: "actionId", ids: ["two-player-flex"], actor: "other" }, { type: "selectedEffectType", types: ["buildingSupplies"] }] } },
    ],
  },
  "wild-boar-hunter": {
    name: "野猪猎人",
    sourceName: "Wild Boar Hunter",
    effects: [{ type: "gainAnimals", trigger: "returnHome", animals: { boar: 1 }, cost: { wood: 1 }, condition: { type: "actionSpacesOccupied", ids: ["forest", "five-grove", "five-riverbank-forest"] } }],
  },
  "game-taster": {
    name: "野味品尝师",
    sourceName: "Game Taster",
    effects: [
      { type: "gainAnimals", trigger: "afterAction", animals: { cattle: 1 }, condition: { type: "allOf", conditions: [{ type: "actionGroup", groups: ["fishing", "travelingPlayers"] }, { type: "accumulatedTaken", resource: "food", atLeast: 1 }] } },
      { type: "gainAnimals", trigger: "afterAction", animals: { boar: 1 }, condition: { type: "allOf", conditions: [{ type: "actionGroup", groups: ["fishing", "travelingPlayers"] }, { type: "accumulatedTaken", resource: "food", atLeast: 2 }] } },
      { type: "gainAnimals", trigger: "afterAction", animals: { sheep: 1 }, condition: { type: "allOf", conditions: [{ type: "actionGroup", groups: ["fishing", "travelingPlayers"] }, { type: "accumulatedTaken", resource: "food", atLeast: 3 }] } },
    ],
  },
  "fast-mason": {
    name: "快手石匠",
    sourceName: "Fast Mason",
    effects: [{ type: "renovateHouse", trigger: "afterAction", freeReed: true, condition: { type: "actionGroup", groups: ["clayOrStoneAccumulation"] } }],
  },
  "amateur-fencer": {
    name: "业余围栏工",
    sourceName: "Amateur Fencer",
    effects: [{ type: "createFreePasture", trigger: "onPlay", cells: 1, condition: { type: "pasturesExactly", count: 0 } }],
  },
  "young-artist": {
    name: "年轻艺人",
    sourceName: "Young Artist",
    effects: [{ type: "drawCards", trigger: "returnHome", deck: "minorImprovement", amount: 2, cost: { food: 1 } }],
  },
  "field-counter": {
    name: "田地计数员",
    sourceName: "Field Counter",
    effects: [
      { type: "storeGoods", trigger: "afterAction", resources: { food: 1 }, condition: { type: "actionGroup", groups: ["plow"], actor: "other" } },
      { type: "claimStoredGoods", trigger: "returnHome", once: true },
    ],
  },
  "top-outer": {
    name: "顶外工",
    sourceName: "Top-Outer",
    effects: [{ type: "claimAccumulated", trigger: "afterAction", actionSpaceId: "five-build-room-traveling", resource: "food", condition: { type: "allOf", conditions: [{ type: "actionId", ids: ["five-build-room-traveling"] }, { type: "selectedEffectType", types: ["buildRooms"] }] } }],
  },
  "stone-custodian": {
    name: "石头保管人",
    sourceName: "Stone Custodian",
    effects: [{ type: "gainResourcesByConditionCount", trigger: "returnHome", count: { type: "actionSpacesWithAccumulated", ids: ["western-quarry", "eastern-quarry"], resource: "stone" }, thresholds: [{ min: 1, resources: { grain: 1 } }, { min: 2, resources: { vegetable: 1 } }] }],
  },
  "village-teacher": {
    name: "乡村教师",
    sourceName: "Village Teacher",
    effects: [{ type: "gainResourcesByConditionCount", trigger: "afterAction", count: { type: "actionSpacesOccupied", ids: ["lessons", "five-lessons-copse", "five-lessons-family"] }, thresholds: [{ min: 1, max: 1, resources: { food: 1 } }, { min: 2, max: 2, resources: { grain: 1 } }, { min: 3, resources: { vegetable: 1 } }], condition: { type: "actionGroup", groups: ["lessons"] } }],
  },
  cleanacre: {
    name: "净田人",
    sourceName: "Cleanacre",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { clay: 2 }, condition: { type: "actionGroup", groups: ["fieldActions"] } }],
  },
  "mountain-hiker": {
    name: "山地徒步者",
    sourceName: "Mountain Hiker",
    effects: [{ type: "buyGoods", trigger: "afterAction", cost: { food: 1 }, goods: { stone: 1 }, condition: { type: "allOf", conditions: [{ type: "actionId", ids: ["five-lessons-copse", "five-grove", "five-riverbank-forest", "five-hollow", "five-build-room-traveling", "two-player-flex"] }, { type: "accumulatedTaken", atLeast: 1 }] } }],
  },
  "on-site-reverend": {
    name: "驻地牧师",
    sourceName: "On-Site Reverend",
    effects: [{ type: "gainResources", trigger: "harvestStart", resources: { stone: 1 } }],
  },
  "bovine-pioneer": {
    name: "牛群先锋",
    sourceName: "Bovine Pioneer",
    effects: [{ type: "gainAnimals", trigger: "afterAction", animals: { cattle: 1 }, condition: { type: "newPastureCreated", previouslyUnfenced: true } }],
  },
  trapper: {
    name: "陷阱猎人",
    sourceName: "Trapper",
    effects: [{ type: "gainAnimalsByConditionCount", trigger: "afterAction", count: { type: "actionSpacesOccupied", ids: ["forest", "five-lessons-copse", "five-grove", "five-riverbank-forest"] }, thresholds: [{ min: 2, max: 2, animals: { sheep: 1 } }, { min: 3, max: 3, animals: { boar: 1 } }, { min: 4, animals: { cattle: 1 } }], cost: { food: 1 }, condition: { type: "actionGroup", groups: ["woodAccumulation"] } }],
  },
  plowsmith: {
    name: "犁匠",
    sourceName: "Plowsmith",
    effects: [{ type: "plowField", trigger: "afterAction", amount: 1, cost: { food: 1 }, condition: { type: "allOf", conditions: [{ type: "actionGroup", groups: ["woodAccumulation"], actor: "other" }, { type: "accumulatedTaken", resource: "wood", atLeast: 4, actor: "other" }] } }],
  },
  "fold-builder": { name: "羊圈建造者", sourceName: "Fold Builder", effects: [{ type: "createActionSpace", trigger: "onPlay", id: "fold-builder-action", name: "羊圈建造", visibility: "public", ownerPayment: { food: 1 }, effects: [{ type: "buildFences" }, { type: "gainAnimal", animal: "sheep", amount: 1 }] }] },
  "senior-teacher": {
    name: "高级教师",
    sourceName: "Senior Teacher",
    effects: [{ type: "gainResources", trigger: "afterAction", resources: { food: 1 }, condition: { type: "actionGroup", groups: ["lessons"], actor: "other" } }],
  },
  "putcher-maker": {
    name: "鱼笼匠",
    sourceName: "Putcher Maker",
    effects: [{ type: "conversion", timing: "anytime", from: { reed: 1 }, to: { food: 2 } }],
  },
  "town-clerk": {
    name: "镇书记",
    sourceName: "Town Clerk",
    effects: [
      { type: "storeGoods", trigger: "afterAction", resources: { food: 1 }, condition: { type: "actionGroup", groups: ["majorImprovement"] } },
      { type: "claimStoredGoods", trigger: "returnHome", once: true },
    ],
  },
  "loess-gardener": {
    name: "黄土园丁",
    sourceName: "Loess Gardener",
    effects: [{ type: "buyGoods", trigger: "afterAction", cost: { food: 1 }, goods: { vegetable: 1 }, condition: { type: "actionId", ids: ["clay-pit"] } }],
  },
  countryman: {
    name: "乡下人",
    sourceName: "Countryman",
    effects: [{ type: "sowOneField", trigger: "afterAction", condition: { type: "actionGroup", groups: ["renovation"], actor: "any" } }],
  },
  woodshacker: {
    name: "劈木工",
    sourceName: "Woodshacker",
    effects: [{ type: "gainResourcesByConditionCount", trigger: "afterAction", count: { type: "actionSpacesOccupied", ids: ["forest", "five-lessons-copse", "five-grove", "five-riverbank-forest"] }, thresholds: [{ min: 1, max: 1, resources: { clay: 1 } }, { min: 2, resources: { clay: 2 } }], condition: { type: "actionGroup", groups: ["woodAccumulation"] } }],
  },
  graduate: {
    name: "毕业生",
    sourceName: "Graduate",
    cost: { food: 1 },
    effects: [{ type: "gainResources", trigger: "onPlay", resources: { stone: 2, reed: 2 } }],
  },
  "substitute-teacher": { name: "代课教师", sourceName: "Substitute Teacher", effects: [{ type: "autoPlayCard", trigger: "afterAction", kind: "occupation", cost: { wood: 1 }, condition: { type: "actionSpacesOccupied", ids: ["lessons", "five-lessons-copse", "five-lessons-family"] } }] },
  bullcatcher: {
    name: "捕牛人",
    sourceName: "Bullcatcher",
    effects: [{ type: "gainGoods", trigger: "returnHome", goods: { cattle: 1, food: 2 }, removeWorkers: 1, condition: { type: "actionSpacesOccupied", ids: ["boar-market", "cattle-market"] } }],
  },
  "part-time-worker": {
    name: "兼职工",
    sourceName: "Part-Time Worker",
    effects: [{ type: "returnAccumulatedByThreshold", trigger: "afterAction", thresholds: [{ min: 2, max: 3, returnAmount: 1, animals: { sheep: 1 } }, { min: 4, max: 5, returnAmount: 2, animals: { boar: 1 } }, { min: 6, returnAmount: 3, animals: { cattle: 1 } }], condition: { type: "actionGroup", groups: ["woodAccumulation", "clayAccumulation", "stoneAccumulation", "fishing"] } }],
  },
};

export const occupations: OccupationDefinition[] = occupationBase
  .map((card) => ({ ...card, ...occupationOverrides[card.id], effects: occupationOverrides[card.id]?.effects ?? card.effects }))
  .filter((card) => card.implementationStatus !== "placeholder");

export function getOccupation(cardId: string): OccupationDefinition | undefined {
  return occupations.find((card) => card.id === cardId);
}
