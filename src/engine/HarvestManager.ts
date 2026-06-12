import type { GameState } from "../state/GameState";
import { AnimalManager } from "./AnimalManager";
import { CardManager } from "./CardManager";
import { FarmManager } from "./FarmManager";
import { RoundManager } from "./RoundManager";
import { ScoringManager } from "./ScoringManager";

export interface HarvestFeedingInput {
  grainToFood: number;
  vegetableToFood: number;
}

export class HarvestManager {
  private animalManager = new AnimalManager();
  private cardManager = new CardManager();
  private farmManager = new FarmManager();
  private roundManager = new RoundManager();
  private scoringManager = new ScoringManager();

  harvest(state: GameState): GameState {
    if (state.harvestFeeding?.round === state.round) {
      return state;
    }

    return {
      ...state,
      stage: "HARVEST_FIELD",
      players: state.players.map((player) => this.farmManager.harvestFields(player)),
      actionLog: [...state.actionLog, `第${state.round}轮收获田地。`],
      harvestFeeding: {
        round: state.round,
        submittedPlayerIds: [],
      },
    };
  }

  submitFeeding(state: GameState, playerId: string, input: HarvestFeedingInput): GameState {
    if (state.phase !== "HARVEST") {
      throw new Error("当前不是收获阶段。");
    }

    const harvestFeeding = state.harvestFeeding?.round === state.round ? state.harvestFeeding : { round: state.round, submittedPlayerIds: [] };
    if (harvestFeeding.submittedPlayerIds.includes(playerId)) {
      throw new Error("你已经确认过本轮喂食。");
    }

    const grainToFood = this.normalizeAmount(input.grainToFood);
    const vegetableToFood = this.normalizeAmount(input.vegetableToFood);
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      throw new Error("玩家不存在。");
    }
    if (grainToFood > player.resources.grain) {
      throw new Error("谷物不足，不能转换。");
    }
    if (vegetableToFood > player.resources.vegetable) {
      throw new Error("蔬菜不足，不能转换。");
    }

    const convertedState: GameState = {
      ...state,
      harvestFeeding: {
        ...harvestFeeding,
        submittedPlayerIds: [...harvestFeeding.submittedPlayerIds, playerId],
      },
      players: state.players.map((candidate) =>
        candidate.id === playerId
          ? {
              ...candidate,
              resources: {
                ...candidate.resources,
                grain: candidate.resources.grain - grainToFood,
                vegetable: candidate.resources.vegetable - vegetableToFood,
                food: candidate.resources.food + grainToFood + vegetableToFood,
              },
            }
          : candidate,
      ),
      actionLog: [...state.actionLog, `${player.name} 确认收获喂食。`],
      lastError: null,
    };

    if (!convertedState.players.every((candidate) => convertedState.harvestFeeding?.submittedPlayerIds.includes(candidate.id))) {
      return convertedState;
    }

    return this.finishHarvest(convertedState);
  }

  private finishHarvest(state: GameState): GameState {
    let nextState: GameState = {
      ...state,
      stage: "HARVEST_FEEDING",
      harvestFeeding: null,
    };

    nextState = {
      ...nextState,
      stage: "HARVEST_FEEDING",
      players: nextState.players.map((player) => {
        const converted = this.cardManager.applyHarvestConversions(player);
        const requiredFood = converted.workers.length * 2;
        const paidFood = Math.min(converted.resources.food, requiredFood);
        const missingFood = requiredFood - paidFood;
        return {
          ...converted,
          resources: {
            ...converted.resources,
            food: converted.resources.food - paidFood,
          },
          beggingCards: converted.beggingCards + missingFood,
        };
      }),
      actionLog: [...nextState.actionLog, "喂养家庭并处理乞讨卡。"],
    };

    nextState = {
      ...nextState,
      stage: "HARVEST_BREEDING",
      players: nextState.players.map((player) => this.animalManager.breed(player)),
      actionLog: [...nextState.actionLog, "动物繁殖完成。"],
    };

    if (nextState.round >= 14) {
      return this.scoringManager.scoreGame(nextState);
    }

    return this.roundManager.nextRound(nextState);
  }

  private normalizeAmount(value: number): number {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      throw new Error("转换数量必须是非负整数。");
    }
    return value;
  }
}
