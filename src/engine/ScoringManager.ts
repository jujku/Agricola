import { roomPoints, scoringRules } from "../config/scoringRules";
import { calculateMajorImprovementBasePoints, calculateMajorImprovementBonusPoints } from "../shared/majorImprovementScoring";
import type { GameState } from "../state/GameState";
import type { PlayerState, ScoreBreakdown } from "../state/PlayerState";

export class ScoringManager {
  scoreGame(state: GameState): GameState {
    const players = state.players.map((player) => ({
      ...player,
      score: this.calculateFinalScore(player),
    }));
    const bestTotal = Math.max(...players.map((player) => player.score?.total ?? 0));
    const tied = players.filter((player) => player.score?.total === bestTotal);
    const winnerIds =
      tied.length <= 1
        ? tied.map((player) => player.id)
        : this.resolveTie(tied).map((player) => player.id);

    return {
      ...state,
      phase: "GAME_END",
      stage: "GAME_END",
      players,
      winnerIds,
    };
  }

  calculateFinalScore(player: PlayerState): ScoreBreakdown {
    const fieldsCount = player.farm.cells.filter((cell) => cell.field).length;
    const pastureCount = player.farm.pastures.length;
    const grainInFields = player.farm.cells.reduce((sum, cell) => sum + (cell.field?.crop === "grain" ? cell.field.count : 0), 0);
    const vegetableInFields = player.farm.cells.reduce((sum, cell) => sum + (cell.field?.crop === "vegetable" ? cell.field.count : 0), 0);
    const roomCount = player.farm.cells.filter((cell) => cell.room).length;
    const fencedStables = player.farm.cells.filter((cell) => cell.stable && cell.pastureId).length;
    const emptySpaces = player.farm.cells.filter((cell) => !cell.room && !cell.field && !cell.pastureId && !cell.stable).length;
    const majorPoints = calculateMajorImprovementBasePoints(player);
    const bonusPoints = calculateMajorImprovementBonusPoints(player);
    const breakdown: Omit<ScoreBreakdown, "total"> = {
      fields: this.scoreRange("fields", fieldsCount),
      pastures: this.scoreRange("pastures", pastureCount),
      grain: this.scoreRange("grain", player.resources.grain + grainInFields),
      vegetables: this.scoreRange("vegetables", player.resources.vegetable + vegetableInFields),
      sheep: this.scoreRange("sheep", player.animals.sheep),
      boar: this.scoreRange("boar", player.animals.boar),
      cattle: this.scoreRange("cattle", player.animals.cattle),
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

  private scoreRange(id: string, value: number): number {
    const rule = scoringRules.find((candidate) => candidate.id === id);
    const range = rule?.ranges.find((candidate) => value >= candidate.min && (candidate.max === null || value <= candidate.max));
    return range?.points ?? 0;
  }

  private resolveTie(players: PlayerState[]): PlayerState[] {
    const resourceTotal = (player: PlayerState) => player.resources.wood + player.resources.clay + player.resources.reed + player.resources.stone;
    const best = Math.max(...players.map(resourceTotal));
    return players.filter((player) => resourceTotal(player) === best);
  }
}
