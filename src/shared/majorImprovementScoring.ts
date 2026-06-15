import { majorImprovements, type MajorImprovementDefinition } from "../config/majorImprovements";
import type { PlayerState } from "../state/PlayerState";

export interface MajorImprovementScoreDetail {
  card: MajorImprovementDefinition;
  basePoints: number;
  bonusPoints: number;
  totalPoints: number;
  bonusResource?: keyof PlayerState["resources"];
  bonusResourceCount?: number;
}

export function calculateMajorImprovementScoreDetail(player: PlayerState, cardId: string): MajorImprovementScoreDetail | null {
  const card = majorImprovements.find((candidate) => candidate.id === cardId);
  if (!card) return null;
  const bonus = card.effects.find((effect) => effect.type === "gameEndResourceBonus");
  if (!bonus || bonus.type !== "gameEndResourceBonus") {
    return {
      card,
      basePoints: card.victoryPoints,
      bonusPoints: 0,
      totalPoints: card.victoryPoints,
    };
  }

  const resource = bonus.resource as keyof PlayerState["resources"];
  const value = player.resources[resource];
  const range = bonus.ranges.find((candidate) => value >= candidate.min && (candidate.max === null || value <= candidate.max));
  const bonusPoints = range?.points ?? 0;
  return {
    card,
    basePoints: card.victoryPoints,
    bonusPoints,
    totalPoints: card.victoryPoints + bonusPoints,
    bonusResource: resource,
    bonusResourceCount: value,
  };
}

export function calculateMajorImprovementScoreDetails(player: PlayerState): MajorImprovementScoreDetail[] {
  return player.majorImprovements
    .map((id) => calculateMajorImprovementScoreDetail(player, id))
    .filter((detail): detail is MajorImprovementScoreDetail => Boolean(detail));
}

export function calculateMajorImprovementBasePoints(player: PlayerState): number {
  return calculateMajorImprovementScoreDetails(player).reduce((sum, detail) => sum + detail.basePoints, 0);
}

export function calculateMajorImprovementBonusPoints(player: PlayerState): number {
  return calculateMajorImprovementScoreDetails(player).reduce((sum, detail) => sum + detail.bonusPoints, 0);
}

export function calculateMajorImprovementTotalPoints(player: PlayerState): number {
  return calculateMajorImprovementScoreDetails(player).reduce((sum, detail) => sum + detail.totalPoints, 0);
}
