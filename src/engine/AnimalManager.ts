import { animalCapacityRules } from "../config/animalCapacity";
import type { AnimalKey } from "../config/baseActions";
import type { PlayerState } from "../state/PlayerState";

type AnimalCounts = Record<AnimalKey, number>;

export class AnimalManager {
  addAnimals(player: PlayerState, animal: AnimalKey, amount: number): PlayerState {
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
