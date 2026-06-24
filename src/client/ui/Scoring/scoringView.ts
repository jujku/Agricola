import { roomPoints, scoringRules } from "../../../config/scoringRules";
import {
  calculateMajorImprovementBasePoints,
  calculateMajorImprovementBonusPoints,
  calculateMajorImprovementScoreDetails,
} from "../../../shared/majorImprovementScoring";
import { calculateCardBonusPoints, countScoringCrops, countScoringFields } from "../../../shared/cardEffectUtils";
import type { PlayerState, ScoreBreakdown } from "../../../state/PlayerState";
import type { ResourceIconKey } from "../VisualSystem/ResourceIcons";

export type ScoreKey = keyof Omit<ScoreBreakdown, "total">;

export const scoreRows: Array<{ key: ScoreKey; label: string; unit: string; icon: ResourceIconKey }> = [
  { key: "fields", label: "田地", unit: "块", icon: "field" },
  { key: "pastures", label: "牧场", unit: "个", icon: "pasture" },
  { key: "grain", label: "谷物", unit: "个", icon: "grain" },
  { key: "vegetables", label: "蔬菜", unit: "个", icon: "vegetable" },
  { key: "sheep", label: "羊", unit: "只", icon: "sheep" },
  { key: "boar", label: "野猪", unit: "只", icon: "boar" },
  { key: "cattle", label: "牛", unit: "头", icon: "cattle" },
  { key: "rooms", label: "房屋", unit: "间", icon: "house" },
  { key: "family", label: "家庭成员", unit: "人", icon: "family" },
  { key: "fencedStables", label: "围栏内马厩", unit: "个", icon: "stable" },
  { key: "majorImprovements", label: "大设施", unit: "张", icon: "stone" },
  { key: "minorImprovements", label: "小设施", unit: "张", icon: "stone" },
  { key: "occupations", label: "职业", unit: "张", icon: "family" },
  { key: "emptySpaces", label: "空地", unit: "格", icon: "field" },
  { key: "beggingCards", label: "乞讨卡", unit: "张", icon: "begging" },
  { key: "bonusPoints", label: "奖励分", unit: "分", icon: "wood" },
];

export function calculateLiveScore(player: PlayerState): ScoreBreakdown {
  const fieldsCount = countScoringFields(player);
  const pastureCount = player.farm.pastures.length;
  const grainInFields = countScoringCrops(player, "grain");
  const vegetableInFields = countScoringCrops(player, "vegetable");
  const roomCount = player.farm.cells.filter((cell) => cell.room).length;
  const fencedStables = player.farm.cells.filter((cell) => cell.stable && cell.pastureId).length;
  const emptySpaces = player.farm.cells.filter((cell) => !cell.room && !cell.field && !cell.pastureId && !cell.stable).length;
  const majorPoints = calculateMajorImprovementBasePoints(player);
  const bonusPoints = calculateMajorImprovementBonusPoints(player);
  const cardPoints = calculateCardBonusPoints(player);
  const breakdown: Omit<ScoreBreakdown, "total"> = {
    fields: scoreRange("fields", fieldsCount),
    pastures: scoreRange("pastures", pastureCount),
    grain: scoreRange("grain", player.resources.grain + grainInFields),
    vegetables: scoreRange("vegetables", player.resources.vegetable + vegetableInFields),
    sheep: scoreRange("sheep", player.animals.sheep),
    boar: scoreRange("boar", player.animals.boar),
    cattle: scoreRange("cattle", player.animals.cattle),
    rooms: roomCount * roomPoints[player.farm.roomMaterial],
    family: player.workers.length * 3,
    fencedStables: Math.min(fencedStables, 4),
    majorImprovements: majorPoints,
    minorImprovements: cardPoints.minor,
    occupations: cardPoints.occupation,
    emptySpaces: -emptySpaces,
    beggingCards: player.beggingCards * -3,
    bonusPoints: bonusPoints + cardPoints.bonus,
  };
  return {
    ...breakdown,
    total: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
  };
}

export function describeScoreValue(player: PlayerState, key: ScoreKey): string {
  if (key === "fields") return `${countScoringFields(player)}块田地`;
  if (key === "pastures") return `${player.farm.pastures.length}个牧场`;
  if (key === "grain") return `${player.resources.grain + countScoringCrops(player, "grain")}个谷物`;
  if (key === "vegetables") return `${player.resources.vegetable + countScoringCrops(player, "vegetable")}个蔬菜`;
  if (key === "sheep") return `${player.animals.sheep}只羊`;
  if (key === "boar") return `${player.animals.boar}只野猪`;
  if (key === "cattle") return `${player.animals.cattle}头牛`;
  if (key === "rooms") return `${player.farm.cells.filter((cell) => cell.room).length}间${roomMaterialLabel(player.farm.roomMaterial)}房`;
  if (key === "family") return `${player.workers.length}个家庭成员`;
  if (key === "fencedStables") return `${player.farm.cells.filter((cell) => cell.stable && cell.pastureId).length}个`;
  if (key === "majorImprovements") return `${player.majorImprovements.length}张`;
  if (key === "minorImprovements") return `${player.minorImprovements.length}张`;
  if (key === "occupations") return `${player.occupations.length}张`;
  if (key === "emptySpaces") return `${player.farm.cells.filter((cell) => !cell.room && !cell.field && !cell.pastureId && !cell.stable).length}格`;
  if (key === "beggingCards") return `${player.beggingCards}张`;
  return describeMajorImprovementBonus(player);
}

export function formatRangeText(id: string): string {
  const rule = scoringRules.find((candidate) => candidate.id === id);
  if (!rule) return "";
  return rule.ranges.map((range) => `${rangeLabel(range.min, range.max)}：${signed(range.points)}分`).join("，");
}

function scoreRange(id: string, value: number): number {
  const rule = scoringRules.find((candidate) => candidate.id === id);
  const range = rule?.ranges.find((candidate) => value >= candidate.min && (candidate.max === null || value <= candidate.max));
  return range?.points ?? 0;
}

function roomMaterialLabel(material: PlayerState["farm"]["roomMaterial"]): string {
  if (material === "clay") return "瓦";
  if (material === "stone") return "石头";
  return "木";
}

function describeMajorImprovementBonus(player: PlayerState): string {
  const activeBonuses = calculateMajorImprovementScoreDetails(player).filter((detail) => detail.bonusPoints > 0);
  if (activeBonuses.length === 0) return "暂无奖励";
  return activeBonuses.map((detail) => `${detail.card.name}+${detail.bonusPoints}`).join("、");
}

function rangeLabel(min: number, max: number | null): string {
  if (max === null) return `${min}+`;
  if (min === max) return `${min}`;
  return `${min}-${max}`;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
