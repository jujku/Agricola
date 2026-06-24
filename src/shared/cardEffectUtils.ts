import type { CropKey, ResourceKey } from "../config/baseActions";
import { majorImprovements } from "../config/majorImprovements";
import { getMinorImprovement, type CardCondition, type CardEffect, type CostModifierScope } from "../config/minorImprovements";
import { getOccupation } from "../config/occupations";
import type { PlayerState } from "../state/PlayerState";

export type ActionAccess = Extract<CardEffect, { type: "actionAccess" }>["access"];

export function getPlayerCardEffects(player: PlayerState): CardEffect[] {
  return [...(player.occupations ?? []), ...(player.minorImprovements ?? [])].flatMap((cardId) => getMinorImprovement(cardId)?.effects ?? getOccupation(cardId)?.effects ?? []);
}

export function applyCardCostModifiers(player: PlayerState, scope: CostModifierScope, cost: Partial<Record<ResourceKey, number>>): Partial<Record<ResourceKey, number>> {
  const next = { ...cost };
  getPlayerCardEffects(player)
    .filter((effect): effect is Extract<CardEffect, { type: "costModifier" }> => effect.type === "costModifier" && effect.scope === scope)
    .forEach((modifier) => {
      if (modifier.resource && modifier.discount) {
        const discountMultiplier = modifier.discountByInitialRooms ? countInitialRooms(player) : modifier.discountByRooms ? countRooms(player) : 1;
        const discount = modifier.discount * discountMultiplier;
        next[modifier.resource] = Math.max(0, (next[modifier.resource] ?? 0) - discount);
      }
      if (modifier.substitute) {
        const from = modifier.substitute.from;
        const to = modifier.substitute.to;
        const ratio = modifier.substitute.ratio ?? 1;
        const required = next[from] ?? 0;
        const available = Math.floor(player.resources[to] / ratio);
        const substituted = Math.min(required, available);
        if (substituted > 0) {
          next[from] = required - substituted;
          next[to] = (next[to] ?? 0) + substituted * ratio;
        }
      }
    });
  return next;
}

export function cardCapacityBonus(player: PlayerState, scope: Extract<CardEffect, { type: "capacity" }>["scope"]): number {
  return getPlayerCardEffects(player)
    .filter((effect): effect is Extract<CardEffect, { type: "capacity" }> => effect.type === "capacity" && effect.scope === scope && (!effect.condition || playerOnlyConditionMatches(player, effect.condition)))
    .reduce((sum, effect) => sum + effect.amount, 0);
}

export function hasCardActionRestriction(player: PlayerState, action: Extract<CardEffect, { type: "actionRestriction" }>["action"]): boolean {
  return getPlayerCardEffects(player).some((effect) => effect.type === "actionRestriction" && effect.action === action && (!effect.condition || playerOnlyConditionMatches(player, effect.condition)));
}

export function hasCardActionAccess(player: PlayerState, access: ActionAccess): boolean {
  return getPlayerCardEffects(player).some((effect) => effect.type === "actionAccess" && effect.access === access);
}

export function findCardIdWithActionAccess(player: PlayerState, access: ActionAccess): string | null {
  return [...(player.occupations ?? []), ...(player.minorImprovements ?? [])].find((cardId) =>
    (getMinorImprovement(cardId)?.effects ?? getOccupation(cardId)?.effects ?? []).some((effect) => effect.type === "actionAccess" && effect.access === access),
  ) ?? null;
}

export function countVirtualFields(player: PlayerState, crop?: CropKey): number {
  return getPlayerCardEffects(player)
    .filter((effect): effect is Extract<CardEffect, { type: "virtualField" }> => effect.type === "virtualField" && (!crop || effect.crop === crop))
    .length;
}

export function countScoringFields(player: PlayerState): number {
  return player.farm.cells.filter((cell) => cell.field).length + countVirtualFields(player);
}

export function countScoringCropFields(player: PlayerState, crop: CropKey): number {
  return player.farm.cells.filter((cell) => cell.field?.crop === crop).length + countVirtualFields(player, crop);
}

export function countScoringCrops(player: PlayerState, crop: CropKey): number {
  return player.farm.cells.reduce((sum, cell) => sum + (cell.field?.crop === crop ? cell.field.count : 0), 0) + countVirtualFields(player, crop);
}

export function calculateCardBonusPoints(player: PlayerState, allPlayers: PlayerState[] = [player]): { minor: number; occupation: number; bonus: number } {
  const minorPrinted = player.minorImprovements.reduce((sum, cardId) => sum + (getMinorImprovement(cardId)?.victoryPoints ?? 0), 0);
  const cardStateBonus = Object.values(player.cardStates ?? {}).reduce((sum, state) => sum + (state.bonusPoints ?? 0), 0);
  const occupationBonus = player.occupations.reduce((sum, cardId) => sum + scoreCardEffects(player, allPlayers, cardId), 0);
  const minorBonus = player.minorImprovements.reduce((sum, cardId) => sum + scoreCardEffects(player, allPlayers, cardId), 0);
  return {
    minor: minorPrinted,
    occupation: occupationBonus,
    bonus: cardStateBonus + minorBonus,
  };
}

function scoreCardEffects(player: PlayerState, allPlayers: PlayerState[], cardId: string): number {
  const effects = getMinorImprovement(cardId)?.effects ?? getOccupation(cardId)?.effects ?? [];
  return effects.reduce((sum, effect) => {
    if (effect.type !== "scoring") return sum;
    return sum + scoreCardRule(player, allPlayers, cardId, effect.rule);
  }, 0);
}

function scoreCardRule(player: PlayerState, allPlayers: PlayerState[], cardId: string, rule: Extract<CardEffect, { type: "scoring" }>["rule"]): number {
  if (rule.type === "pastureCells") {
    const covered = player.farm.pastures.reduce((sum, pasture) => sum + pasture.cells.length, 0);
    return rule.thresholds.reduce((best, threshold) => (covered >= threshold.min ? Math.max(best, threshold.points) : best), 0);
  }
  if (rule.type === "roomMaterial") return rule.points[player.farm.roomMaterial] ?? 0;
  if (rule.type === "animalsPer") return Math.floor(player.animals[rule.animal] / rule.per) * rule.points;
  if (rule.type === "playedImprovements") {
    const count = player.majorImprovements.length + player.minorImprovements.length;
    return rule.thresholds.reduce((best, threshold) => (count >= threshold.min ? Math.max(best, threshold.points) : best), 0);
  }
  if (rule.type === "unfencedStables") return player.farm.cells.filter((cell) => cell.stable && !cell.pastureId).length * rule.pointsEach;
  if (rule.type === "pasturesWithAnimals") {
    const pasturePoints = player.farm.pastures.filter((pasture) => pasture.animalCount > 0).length * rule.pointsEach;
    const totalAnimals = player.animals.sheep + player.animals.boar + player.animals.cattle;
    return pasturePoints + (rule.extraIfAnimalsAtLeast && totalAnimals >= rule.extraIfAnimalsAtLeast.count ? rule.extraIfAnimalsAtLeast.points : 0);
  }
  if (rule.type === "playedOccupationsAfterThis") {
    const playedRound = player.cardStates?.[cardId]?.playedRound ?? 0;
    return player.occupations.filter((id) => id !== cardId && (player.cardStates?.[id]?.playedRound ?? 0) >= playedRound).length * rule.pointsEach;
  }
  if (rule.type === "roomLeader") {
    const roomCount = countRooms(player);
    const maxRooms = Math.max(...allPlayers.map((candidate) => countRooms(candidate)));
    return roomCount === maxRooms ? rule.points : 0;
  }
  if (rule.type === "playedRoundThreshold") {
    const playedRound = player.cardStates?.[cardId]?.playedRound ?? 99;
    const match = rule.thresholds.find((threshold) => playedRound <= threshold.maxRound);
    return match?.points ?? 0;
  }
  if (rule.type === "familySize") {
    return rule.thresholds.reduce((best, threshold) => (player.workers.length >= threshold.min ? Math.max(best, threshold.points) : best), 0);
  }
  return 0;
}

function countRooms(player: PlayerState): number {
  return player.farm.cells.filter((cell) => cell.room).length;
}

function countInitialRooms(player: PlayerState): number {
  return player.farm.cells.filter((cell) => cell.room && cell.col === 0 && (cell.row === 1 || cell.row === 2)).length;
}

function playerOnlyConditionMatches(player: PlayerState, condition: CardCondition): boolean {
  if (condition.type === "allOf") return condition.conditions.every((item) => playerOnlyConditionMatches(player, item));
  if (condition.type === "anyOf") return condition.conditions.some((item) => playerOnlyConditionMatches(player, item));
  if (condition.type === "ownedMajorImprovementCostAtLeast") {
    const allowed = condition.resources ? new Set(condition.resources) : null;
    const total = player.majorImprovements.reduce((sum, cardId) => {
      const card = majorImprovements.find((candidate) => candidate.id === cardId);
      if (!card) return sum;
      return sum + Object.entries(card.cost).reduce((costSum, [resource, amount]) => {
        return isResourceKey(resource) && (!allowed || allowed.has(resource)) ? costSum + amount : costSum;
      }, 0);
    }, 0);
    return total >= condition.count;
  }
  if (condition.type === "roomMaterial") return condition.materials.includes(player.farm.roomMaterial);
  if (condition.type === "roomsAtLeast") return countRooms(player) >= condition.count;
  if (condition.type === "roomsExactly") return countRooms(player) === condition.count;
  if (condition.type === "workersExactly") return player.workers.length === condition.count;
  if (condition.type === "animalsAtLeast") return player.animals[condition.animal] >= condition.count;
  if (condition.type === "playedOccupationsAtLeast") return player.occupations.length >= condition.count;
  if (condition.type === "pasturesExactly") return player.farm.pastures.length === condition.count;
  return false;
}

function isResourceKey(key: string): key is ResourceKey {
  return ["wood", "clay", "reed", "stone", "grain", "vegetable", "food"].includes(key);
}
