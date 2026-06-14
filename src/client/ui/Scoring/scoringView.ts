import { majorImprovements } from "../../../config/majorImprovements";
import { roomPoints, scoringRules } from "../../../config/scoringRules";
import type { PlayerState, ScoreBreakdown } from "../../../state/PlayerState";

export type ScoreKey = keyof Omit<ScoreBreakdown, "total">;

export const scoreRows: Array<{ key: ScoreKey; label: string; unit: string }> = [
  { key: "fields", label: "田地", unit: "块" },
  { key: "pastures", label: "牧场", unit: "个" },
  { key: "grain", label: "谷物", unit: "个" },
  { key: "vegetables", label: "蔬菜", unit: "个" },
  { key: "sheep", label: "羊", unit: "只" },
  { key: "boar", label: "野猪", unit: "只" },
  { key: "cattle", label: "牛", unit: "头" },
  { key: "rooms", label: "房屋", unit: "间" },
  { key: "family", label: "家庭成员", unit: "人" },
  { key: "fencedStables", label: "围栏内马厩", unit: "个" },
  { key: "majorImprovements", label: "大设施", unit: "张" },
  { key: "minorImprovements", label: "小设施", unit: "张" },
  { key: "occupations", label: "职业", unit: "张" },
  { key: "emptySpaces", label: "空地", unit: "格" },
  { key: "beggingCards", label: "乞讨卡", unit: "张" },
  { key: "bonusPoints", label: "奖励分", unit: "分" },
];

export function calculateLiveScore(player: PlayerState): ScoreBreakdown {
  const fieldsCount = player.farm.cells.filter((cell) => cell.field).length;
  const pastureCount = player.farm.pastures.length;
  const grainInFields = player.farm.cells.reduce((sum, cell) => sum + (cell.field?.crop === "grain" ? cell.field.count : 0), 0);
  const vegetableInFields = player.farm.cells.reduce((sum, cell) => sum + (cell.field?.crop === "vegetable" ? cell.field.count : 0), 0);
  const roomCount = player.farm.cells.filter((cell) => cell.room).length;
  const fencedStables = player.farm.cells.filter((cell) => cell.stable && cell.pastureId).length;
  const emptySpaces = player.farm.cells.filter((cell) => !cell.room && !cell.field && !cell.pastureId && !cell.stable).length;
  const majorPoints = player.majorImprovements.reduce((sum, id) => sum + (majorImprovements.find((card) => card.id === id)?.victoryPoints ?? 0), 0);
  const bonusPoints = calculateMajorBonus(player);
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
    minorImprovements: 0,
    occupations: 0,
    emptySpaces: -emptySpaces,
    beggingCards: player.beggingCards * -3,
    bonusPoints,
  };
  return {
    ...breakdown,
    total: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
  };
}

export function describeScoreValue(player: PlayerState, key: ScoreKey): string {
  if (key === "fields") return `${player.farm.cells.filter((cell) => cell.field).length}块田地`;
  if (key === "pastures") return `${player.farm.pastures.length}个牧场`;
  if (key === "grain") return `${player.resources.grain + cropCount(player, "grain")}个谷物`;
  if (key === "vegetables") return `${player.resources.vegetable + cropCount(player, "vegetable")}个蔬菜`;
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
  return "大设施奖励";
}

export function formatRangeText(id: string): string {
  const rule = scoringRules.find((candidate) => candidate.id === id);
  if (!rule) return "";
  return rule.ranges.map((range) => `${rangeLabel(range.min, range.max)}：${signed(range.points)}分`).join("，");
}

function cropCount(player: PlayerState, crop: "grain" | "vegetable"): number {
  return player.farm.cells.reduce((sum, cell) => sum + (cell.field?.crop === crop ? cell.field.count : 0), 0);
}

function scoreRange(id: string, value: number): number {
  const rule = scoringRules.find((candidate) => candidate.id === id);
  const range = rule?.ranges.find((candidate) => value >= candidate.min && (candidate.max === null || value <= candidate.max));
  return range?.points ?? 0;
}

function calculateMajorBonus(player: PlayerState): number {
  return player.majorImprovements.reduce((sum, id) => {
    const card = majorImprovements.find((candidate) => candidate.id === id);
    const bonus = card?.effects.find((effect) => effect.type === "gameEndResourceBonus");
    if (!bonus || bonus.type !== "gameEndResourceBonus") return sum;
    const value = player.resources[bonus.resource];
    const range = bonus.ranges.find((candidate) => value >= candidate.min && (candidate.max === null || value <= candidate.max));
    return sum + (range?.points ?? 0);
  }, 0);
}

function roomMaterialLabel(material: PlayerState["farm"]["roomMaterial"]): string {
  if (material === "clay") return "瓦";
  if (material === "stone") return "石头";
  return "木";
}

function rangeLabel(min: number, max: number | null): string {
  if (max === null) return `${min}+`;
  if (min === max) return `${min}`;
  return `${min}-${max}`;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
