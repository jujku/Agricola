import type { GameState } from "../state/GameState";
import { AnimalManager } from "./AnimalManager";
import { CardManager } from "./CardManager";
import { FarmManager } from "./FarmManager";
import { RoundManager } from "./RoundManager";
import { ScoringManager } from "./ScoringManager";

export class HarvestManager {
  private animalManager = new AnimalManager();
  private cardManager = new CardManager();
  private farmManager = new FarmManager();
  private roundManager = new RoundManager();
  private scoringManager = new ScoringManager();

  harvest(state: GameState): GameState {
    let nextState: GameState = {
      ...state,
      stage: "HARVEST_FIELD",
      players: state.players.map((player) => this.farmManager.harvestFields(player)),
      actionLog: [...state.actionLog, `第${state.round}轮收获田地。`],
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
}
