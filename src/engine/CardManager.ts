import { majorImprovements, type MajorImprovementDefinition } from "../config/majorImprovements";
import type { ResourceKey } from "../config/baseActions";
import type { ActionInput } from "../shared/types";
import type { GameState } from "../state/GameState";
import type { PlayerState } from "../state/PlayerState";
import { FarmManager } from "./FarmManager";

export class CardManager {
  private farmManager = new FarmManager();

  registerCardEffects(state: GameState): GameState {
    return state;
  }

  buyMajorImprovement(state: GameState, playerId: string, cardId: string, input: ActionInput = {}): GameState {
    const card = majorImprovements.find((candidate) => candidate.id === cardId);
    if (!card) {
      throw new Error("大设施不存在。");
    }
    if (state.majorImprovements.find((candidate) => candidate.id === cardId)?.purchasedBy) {
      throw new Error("该大设施已被购买。");
    }
    const player = state.players.find((candidate) => candidate.id === playerId);
    const returnedCardId =
      input.upgradeFromId && card.upgradeFrom?.includes(input.upgradeFromId) && player?.majorImprovements.includes(input.upgradeFromId)
        ? input.upgradeFromId
        : undefined;

    return this.updatePlayer(state, playerId, (player) => {
      let nextPlayer = this.payForMajor(player, card, input.upgradeFromId);
      nextPlayer = {
        ...nextPlayer,
        majorImprovements: [...nextPlayer.majorImprovements, card.id],
      };
      if (card.effects.some((effect) => effect.type === "wellFood")) {
        nextPlayer = this.scheduleWellFood(state, nextPlayer, card);
      }
      if (input.bake) {
        nextPlayer = this.bakeBread(nextPlayer, input.bake.improvementId, input.bake.grain);
      }
      return nextPlayer;
    }, cardId, returnedCardId);
  }

  bakeBread(player: PlayerState, improvementId: string, grain: number): PlayerState {
    if (!player.majorImprovements.includes(improvementId)) {
      throw new Error("玩家没有该烤面包大设施。");
    }
    const card = majorImprovements.find((candidate) => candidate.id === improvementId);
    const effect = card?.effects.find((candidate) => candidate.type === "bakeBread");
    if (!effect || effect.type !== "bakeBread") {
      throw new Error("该大设施不能烤面包。");
    }
    const amount = Math.floor(grain);
    if (amount <= 0 || player.resources.grain < amount) {
      throw new Error("谷物不足，不能烤面包。");
    }
    const grainLimit = effect.grainLimit ?? 1;
    if (amount > grainLimit) {
      throw new Error(`一次烤面包最多只能烤${grainLimit}个谷物。`);
    }
    return {
      ...player,
      resources: {
        ...player.resources,
        grain: player.resources.grain - amount,
        food: player.resources.food + amount * effect.foodPerGrain,
      },
    };
  }

  cook(player: PlayerState, improvementId: string, from: "vegetable" | "sheep" | "boar" | "cattle", amount: number): PlayerState {
    if (!player.majorImprovements.includes(improvementId)) {
      throw new Error("玩家没有该烹饪大设施。");
    }
    const card = majorImprovements.find((candidate) => candidate.id === improvementId);
    const effect = card?.effects.find((candidate) => candidate.type === "cook" && candidate.from === from);
    if (!effect || effect.type !== "cook") {
      throw new Error("该大设施不能进行此转换。");
    }
    if (from === "vegetable") {
      if (player.resources.vegetable < amount) {
        throw new Error("蔬菜不足，不能烹饪。");
      }
      return {
        ...player,
        resources: {
          ...player.resources,
          vegetable: player.resources.vegetable - amount,
          food: player.resources.food + amount * effect.toFood,
        },
      };
    }
    if (player.animals[from] < amount) {
      throw new Error("动物不足，不能烹饪。");
    }
    return {
      ...player,
      animals: {
        ...player.animals,
        [from]: player.animals[from] - amount,
      },
      resources: {
        ...player.resources,
        food: player.resources.food + amount * effect.toFood,
      },
    };
  }

  applyHarvestConversions(player: PlayerState): PlayerState {
    return player.majorImprovements.reduce((currentPlayer, cardId) => {
      const card = majorImprovements.find((candidate) => candidate.id === cardId);
      const effect = card?.effects.find((candidate) => candidate.type === "harvestConvert");
      if (!effect || effect.type !== "harvestConvert") {
        return currentPlayer;
      }
      if (currentPlayer.resources[effect.resource] < effect.amount) {
        return currentPlayer;
      }
      return {
        ...currentPlayer,
        resources: {
          ...currentPlayer.resources,
          [effect.resource]: currentPlayer.resources[effect.resource] - effect.amount,
          food: currentPlayer.resources.food + effect.food,
        },
      };
    }, player);
  }

  applyRoundStartFood(player: PlayerState, round: number): PlayerState {
    const dueFood = player.pendingFood.filter((item) => item.round === round).reduce((sum, item) => sum + item.amount, 0);
    if (dueFood === 0) {
      return player;
    }
    return {
      ...player,
      pendingFood: player.pendingFood.filter((item) => item.round !== round),
      resources: {
        ...player.resources,
        food: player.resources.food + dueFood,
      },
    };
  }

  private payForMajor(player: PlayerState, card: MajorImprovementDefinition, upgradeFromId?: string): PlayerState {
    if (upgradeFromId && card.upgradeFrom?.includes(upgradeFromId) && player.majorImprovements.includes(upgradeFromId)) {
      return {
        ...player,
        majorImprovements: player.majorImprovements.filter((id) => id !== upgradeFromId),
      };
    }
    return this.farmManager.pay(player, card.cost as Partial<Record<ResourceKey, number>>);
  }

  private scheduleWellFood(state: GameState, player: PlayerState, card: MajorImprovementDefinition): PlayerState {
    const effect = card.effects.find((candidate) => candidate.type === "wellFood");
    if (!effect || effect.type !== "wellFood") {
      return player;
    }
    const pendingFood = Array.from({ length: effect.rounds }, (_, index) => ({
      round: state.round + index + 1,
      amount: effect.foodPerRound,
    })).filter((item) => item.round <= 14);
    return {
      ...player,
      pendingFood: [...player.pendingFood, ...pendingFood],
    };
  }

  private updatePlayer(state: GameState, playerId: string, updater: (player: PlayerState) => PlayerState, purchasedCardId: string, returnedCardId?: string): GameState {
    return {
      ...state,
      players: state.players.map((player) => (player.id === playerId ? updater(player) : player)),
      majorImprovements: state.majorImprovements.map((card) => {
        if (card.id === purchasedCardId) return { ...card, purchasedBy: playerId };
        if (returnedCardId && card.id === returnedCardId) return { ...card, purchasedBy: null };
        return card;
      }),
    };
  }
}
