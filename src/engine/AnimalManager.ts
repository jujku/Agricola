import { animalCapacityRules } from "../config/animalCapacity";
import type { AnimalKey } from "../config/baseActions";
import { majorImprovements } from "../config/majorImprovements";
import type { AnimalCookInput, AnimalPlacementInput } from "../shared/types";
import type { PlayerState } from "../state/PlayerState";
import { FarmManager } from "./FarmManager";

type AnimalCounts = Record<AnimalKey, number>;

export class AnimalManager {
  private farmManager = new FarmManager();

  addAnimals(player: PlayerState, animal: AnimalKey, amount: number): PlayerState {
    if (player.farm.fences || player.farm.animalHousing) {
      return this.addAnimalsToAvailableHousing(player, animal, amount);
    }

    const nextAnimals = { ...player.animals };
    let accepted = 0;

    for (let index = 0; index < amount; index += 1) {
      const candidate = {
        ...nextAnimals,
        [animal]: nextAnimals[animal] + 1,
      };
      if (!this.canHouseAnimals(player, candidate)) {
        break;
      }
      nextAnimals[animal] += 1;
      accepted += 1;
    }

    if (accepted === 0) {
      return player;
    }

    return {
      ...player,
      animals: nextAnimals,
    };
  }

  placeAnimals(player: PlayerState, input: AnimalPlacementInput, amount: number): PlayerState {
    const cooked = input.cooked ?? 0;
    const discarded = input.discarded ?? 0;
    const placed = input.placements.reduce((sum, placement) => sum + placement.count, 0);
    if (placed + cooked + discarded !== amount) {
      throw new Error("必须处理全部获得的动物。");
    }
    let nextPlayer = this.farmManager.placeAnimals(player, input.animal, amount, input.placements);
    if (cooked > 0) {
      const foodPerAnimal = input.cookImprovementId ? this.cookValueForImprovement(nextPlayer, input.cookImprovementId, input.animal) : this.cookValue(nextPlayer, input.animal);
      nextPlayer = {
        ...nextPlayer,
        resources: {
          ...nextPlayer.resources,
          food: nextPlayer.resources.food + cooked * foodPerAnimal,
        },
      };
    }
    return nextPlayer;
  }

  cookAnimals(player: PlayerState, cooked: AnimalCookInput[]): PlayerState {
    let nextPlayer = player;
    cooked.forEach((item) => {
      if (item.count <= 0) return;
      if (!this.canCookAnimal(nextPlayer)) {
        throw new Error("没有可烹饪动物的大设施。");
      }
      nextPlayer = this.farmManager.removeAnimals(nextPlayer, item.animal, item.count);
      nextPlayer = {
        ...nextPlayer,
        resources: {
          ...nextPlayer.resources,
          food: nextPlayer.resources.food + item.count * this.cookValue(nextPlayer, item.animal),
        },
      };
    });
    return nextPlayer;
  }

  cookAnimalsWithImprovement(player: PlayerState, improvementId: string, cooked: AnimalCookInput[]): PlayerState {
    if (!player.majorImprovements.includes(improvementId)) {
      throw new Error("玩家没有该大设施。");
    }
    const card = majorImprovements.find((candidate) => candidate.id === improvementId);
    if (!card) {
      throw new Error("大设施不存在。");
    }

    let nextPlayer = player;
    cooked.forEach((item) => {
      if (item.count <= 0) return;
      const effect = card.effects.find((candidate) => candidate.type === "cook" && candidate.from === item.animal);
      if (!effect || effect.type !== "cook") {
        throw new Error("该大设施不能烹饪这种动物。");
      }
      nextPlayer = this.farmManager.removeAnimals(nextPlayer, item.animal, item.count);
      nextPlayer = {
        ...nextPlayer,
        resources: {
          ...nextPlayer.resources,
          food: nextPlayer.resources.food + item.count * effect.toFood,
        },
      };
    });
    return nextPlayer;
  }

  breed(player: PlayerState): PlayerState {
    let nextPlayer = player;
    (["sheep", "boar", "cattle"] as AnimalKey[]).forEach((animal) => {
      if (nextPlayer.animals[animal] >= 2) {
        nextPlayer = this.addAnimals(nextPlayer, animal, 1);
      }
    });
    return nextPlayer;
  }

  totalCapacity(player: PlayerState): number {
    return this.capacitySlots(player).reduce((sum, capacity) => sum + capacity, 0);
  }

  private canHouseAnimals(player: PlayerState, animals: AnimalCounts): boolean {
    const slots = this.capacitySlots(player).sort((left, right) => right - left);
    const counts = (["sheep", "boar", "cattle"] as AnimalKey[])
      .map((animal) => animals[animal])
      .filter((count) => count > 0)
      .sort((left, right) => right - left);

    return this.canAssignCountsToSlots(counts, slots);
  }

  private capacitySlots(player: PlayerState): number[] {
    if (player.farm.fences || player.farm.animalHousing) {
      const farm = this.farmManager.migrateFarm(player.farm);
      const houseSlot = farm.animalHousing.house.count > 0 ? 0 : animalCapacityRules.house;
      const stableSlots = farm.animalHousing.stables.map((stable) => Math.max(0, animalCapacityRules.stableWithoutFence - stable.count));
      const pastureSlots = farm.pastures.map((pasture) => Math.max(0, pasture.capacity - pasture.animalCount));
      return [houseSlot, ...stableSlots, ...pastureSlots].filter((capacity) => capacity > 0);
    }

    const houseCapacity = animalCapacityRules.house;
    const stableSlots = player.farm.cells
      .filter((cell) => cell.stable && !cell.pastureId)
      .map(() => animalCapacityRules.stableWithoutFence);
    const pastureSlots = player.farm.pastures.map((pasture) => {
      const stableCount = pasture.cells.filter((position) =>
        player.farm.cells.some((cell) => cell.row === position.row && cell.col === position.col && cell.stable),
      ).length;
      const oneCellCapacity = animalCapacityRules.pastureWithStables[Math.min(stableCount, 4) as 0 | 1 | 2 | 3 | 4];
      return oneCellCapacity * pasture.cells.length;
    });

    return [houseCapacity, ...stableSlots, ...pastureSlots].filter((capacity) => capacity > 0);
  }

  private addAnimalsToAvailableHousing(player: PlayerState, animal: AnimalKey, amount: number): PlayerState {
    let nextPlayer = { ...player, farm: this.farmManager.migrateFarm(player.farm) };
    let remaining = amount;
    const placements: AnimalPlacementInput["placements"] = [];

    nextPlayer.farm.pastures.forEach((pasture) => {
      if (remaining <= 0 || (pasture.animalType && pasture.animalType !== animal)) return;
      const available = pasture.capacity - pasture.animalCount;
      const count = Math.min(remaining, available);
      if (count <= 0) return;
      const targetCell = pasture.cells[0];
      if (!targetCell) return;
      placements.push({ type: "pasture", pastureId: pasture.id, row: targetCell.row, col: targetCell.col, count });
      remaining -= count;
    });

    nextPlayer.farm.animalHousing.stables.forEach((stable) => {
      if (remaining <= 0 || stable.count > 0) return;
      placements.push({ type: "stable", row: stable.row, col: stable.col, count: 1 });
      remaining -= 1;
    });

    if (remaining > 0 && nextPlayer.farm.animalHousing.house.count === 0) {
      placements.push({ type: "house", count: 1 });
      remaining -= 1;
    }

    return this.farmManager.placeAnimals(nextPlayer, animal, amount, placements);
  }

  private cookValue(player: PlayerState, animal: AnimalKey): number {
    if (!this.canCookAnimal(player)) {
      throw new Error("没有可烹饪动物的大设施。");
    }
    const hasHearth = player.majorImprovements.some((id) => id.startsWith("cooking-hearth"));
    if (animal === "cattle") return hasHearth ? 4 : 3;
    if (animal === "boar") return hasHearth ? 3 : 2;
    return 2;
  }

  private cookValueForImprovement(player: PlayerState, improvementId: string, animal: AnimalKey): number {
    if (!player.majorImprovements.includes(improvementId)) {
      throw new Error("玩家没有该大设施。");
    }
    const card = majorImprovements.find((candidate) => candidate.id === improvementId);
    const effect = card?.effects.find((candidate) => candidate.type === "cook" && candidate.from === animal);
    if (!effect || effect.type !== "cook") {
      throw new Error("该大设施不能烹饪这种动物。");
    }
    return effect.toFood;
  }

  private canCookAnimal(player: PlayerState): boolean {
    return player.majorImprovements.some((id) => id.startsWith("fireplace") || id.startsWith("cooking-hearth"));
  }

  private canAssignCountsToSlots(counts: number[], slots: number[]): boolean {
    if (counts.length === 0) {
      return true;
    }

    const [count, ...remainingCounts] = counts;
    for (let index = 0; index < slots.length; index += 1) {
      if (slots[index] < count) {
        continue;
      }
      const remainingSlots = slots.filter((_, slotIndex) => slotIndex !== index);
      if (this.canAssignCountsToSlots(remainingCounts, remainingSlots)) {
        return true;
      }
    }

    return false;
  }
}
