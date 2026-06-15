import { majorImprovements, type MajorImprovementDefinition } from "../config/majorImprovements";
import type { ResourceKey } from "../config/baseActions";
import type { ActionInput, HarvestConversionInput } from "../shared/types";
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

  applyHarvestConversions(player: PlayerState, conversions: HarvestConversionInput[]): PlayerState {
    const totals = conversions.reduce<Map<string, number>>((summary, conversion) => {
      summary.set(conversion.improvementId, (summary.get(conversion.improvementId) ?? 0) + conversion.count);
      return summary;
    }, new Map());

    return Array.from(totals.entries()).reduce((currentPlayer, [improvementId, count]) => {
      const amount = Math.floor(count);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("大设施收获转换数量必须是非负整数。");
      }
      if (amount !== count) {
        throw new Error("大设施收获转换数量必须是非负整数。");
      }
      if (amount === 0) return currentPlayer;
      if (amount > 1) {
        throw new Error("每个大设施每次收获最多转换一次。");
      }
      if (!currentPlayer.majorImprovements.includes(improvementId)) {
        throw new Error("玩家没有该收获转换大设施。");
      }
      const card = majorImprovements.find((candidate) => candidate.id === improvementId);
      const effect = card?.effects.find((candidate) => candidate.type === "harvestConvert");
      if (!effect || effect.type !== "harvestConvert") {
        throw new Error("该大设施不能在收获喂食时转换资源。");
      }
      const cost = effect.amount * amount;
      if (currentPlayer.resources[effect.resource] < cost) {
        throw new Error("资源不足，不能使用大设施收获转换。");
      }
      return {
        ...currentPlayer,
        resources: {
          ...currentPlayer.resources,
          [effect.resource]: currentPlayer.resources[effect.resource] - cost,
          food: currentPlayer.resources.food + effect.food * amount,
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
      const upgradeFrom = majorImprovements.find((candidate) => candidate.id === upgradeFromId);
      const discount = upgradeFrom?.cost ?? {};
      const difference = Object.entries(card.cost).reduce<Partial<Record<ResourceKey, number>>>((cost, [resource, amount]) => {
        const key = resource as ResourceKey;
        const required = Math.max(0, amount - (discount[resource] ?? 0));
        if (required > 0) cost[key] = required;
        return cost;
      }, {});
      const paid = this.farmManager.pay(player, difference);
      return {
        ...paid,
        majorImprovements: paid.majorImprovements.filter((id) => id !== upgradeFromId),
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
