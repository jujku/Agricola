import type { GameState } from "../state/GameState";
import type { AnimalCookInput, AnimalOverflowResolution } from "../shared/types";
import type { FarmAnimalType } from "../state/FarmState";
import { AnimalManager } from "./AnimalManager";
import { CardManager } from "./CardManager";
import { FarmManager } from "./FarmManager";
import { RoundManager } from "./RoundManager";
import { ScoringManager } from "./ScoringManager";

export interface HarvestFeedingInput {
  grainToFood: number;
  vegetableToFood: number;
  cookedAnimals?: AnimalCookInput[];
}

export class HarvestManager {
  private animalManager = new AnimalManager();
  private cardManager = new CardManager();
  private farmManager = new FarmManager();
  private roundManager = new RoundManager();
  private scoringManager = new ScoringManager();

  harvest(state: GameState): GameState {
    if (state.harvestField?.round === state.round || state.harvestFeeding?.round === state.round || state.harvestBreeding?.round === state.round) {
      return state;
    }

    const harvestedByPlayerId = Object.fromEntries(state.players.map((player) => [player.id, this.calculateFieldHarvest(player)]));

    return {
      ...state,
      stage: "HARVEST_FIELD",
      players: state.players.map((player) => this.farmManager.harvestFields(player)),
      actionLog: [...state.actionLog, `第 ${state.round} 轮收获田地。`],
      harvestField: {
        round: state.round,
        submittedPlayerIds: [],
        harvestedByPlayerId,
      },
      harvestFeeding: null,
      harvestBreeding: null,
      lastError: null,
    };
  }

  submitField(state: GameState, playerId: string): GameState {
    if (state.phase !== "HARVEST" || state.stage !== "HARVEST_FIELD" || !state.harvestField || state.harvestField.round !== state.round) {
      throw new Error("当前不是田地收获确认阶段。");
    }
    if (state.harvestField.submittedPlayerIds.includes(playerId)) {
      throw new Error("你已经确认过本轮田地收获。");
    }
    if (!state.players.some((player) => player.id === playerId)) {
      throw new Error("玩家不存在。");
    }

    const submittedPlayerIds = [...state.harvestField.submittedPlayerIds, playerId];
    const nextState: GameState = {
      ...state,
      harvestField: {
        ...state.harvestField,
        submittedPlayerIds,
      },
      actionLog: [...state.actionLog, `${this.playerName(state, playerId)} 确认田地收获。`],
      lastError: null,
    };

    if (!nextState.players.every((player) => submittedPlayerIds.includes(player.id))) {
      return nextState;
    }

    return {
      ...nextState,
      stage: "HARVEST_FEEDING",
      harvestField: null,
      harvestFeeding: {
        round: state.round,
        submittedPlayerIds: [],
      },
    };
  }

  submitFeeding(state: GameState, playerId: string, input: HarvestFeedingInput): GameState {
    if (state.phase !== "HARVEST" || state.stage !== "HARVEST_FEEDING" || !state.harvestFeeding || state.harvestFeeding.round !== state.round) {
      throw new Error("当前不是喂食阶段。");
    }
    if (state.harvestFeeding.submittedPlayerIds.includes(playerId)) {
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

    const cookedPlayer = this.animalManager.cookAnimals(player, input.cookedAnimals ?? []);
    const convertedState: GameState = {
      ...state,
      harvestFeeding: {
        ...state.harvestFeeding,
        submittedPlayerIds: [...state.harvestFeeding.submittedPlayerIds, playerId],
      },
      players: state.players.map((candidate) =>
        candidate.id === playerId
          ? {
              ...candidate,
              resources: {
                ...candidate.resources,
                grain: candidate.resources.grain - grainToFood,
                vegetable: candidate.resources.vegetable - vegetableToFood,
                food: cookedPlayer.resources.food + grainToFood + vegetableToFood,
              },
              animals: cookedPlayer.animals,
              farm: cookedPlayer.farm,
            }
          : candidate,
      ),
      actionLog: [...state.actionLog, `${player.name} 确认收获喂食。`],
      lastError: null,
    };

    if (!convertedState.players.every((candidate) => convertedState.harvestFeeding?.submittedPlayerIds.includes(candidate.id))) {
      return convertedState;
    }

    return this.finishFeeding(convertedState);
  }

  submitBreeding(state: GameState, playerId: string, resolution: AnimalOverflowResolution): GameState {
    if (state.phase !== "HARVEST" || state.stage !== "HARVEST_BREEDING" || !state.harvestBreeding) {
      throw new Error("当前不是繁殖确认阶段。");
    }
    if (state.harvestBreeding.submittedPlayerIds.includes(playerId)) {
      throw new Error("你已经确认过本轮繁殖。");
    }

    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) throw new Error("玩家不存在。");

    const overflow = state.harvestBreeding.overflowByPlayerId[playerId] ?? {};
    this.assertOverflowResolution(overflow, resolution);

    let nextPlayer = player;
    resolution.placements.forEach((placement) => {
      const animal = "animal" in placement && placement.animal ? placement.animal : this.findOverflowAnimalForPlacement(state, playerId, placement.type === "pasture" ? placement.pastureId : placement.type);
      if (animal) {
        nextPlayer = this.animalManager.placeAnimals(nextPlayer, { animal, placements: [placement], discarded: 0, cooked: 0 }, placement.count);
      }
    });
    nextPlayer = this.cookOverflowBirths(nextPlayer, resolution.cooked);

    const nextState: GameState = {
      ...state,
      players: state.players.map((candidate) => (candidate.id === playerId ? nextPlayer : candidate)),
      harvestBreeding: {
        ...state.harvestBreeding,
        submittedPlayerIds: [...state.harvestBreeding.submittedPlayerIds, playerId],
      },
      actionLog: [...state.actionLog, `${player.name} 确认动物繁殖。`],
      lastError: null,
    };

    if (!nextState.players.every((candidate) => nextState.harvestBreeding?.submittedPlayerIds.includes(candidate.id))) {
      return nextState;
    }
    return this.finishBreeding(nextState);
  }

  private finishFeeding(state: GameState): GameState {
    const fedState: GameState = {
      ...state,
      stage: "HARVEST_FEEDING",
      harvestFeeding: null,
      players: state.players.map((player) => {
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
      actionLog: [...state.actionLog, "喂养家庭并处理乞讨卡。"],
    };

    return this.startBreeding(fedState);
  }

  private startBreeding(state: GameState): GameState {
    let nextState: GameState = {
      ...state,
      stage: "HARVEST_BREEDING",
      harvestBreeding: {
        round: state.round,
        submittedPlayerIds: [],
        pendingPlayerIds: [],
        birthsByPlayerId: {},
        overflowByPlayerId: {},
      },
    };

    nextState.players.forEach((player) => {
      const births = this.calculateBirths(player);
      let updatedPlayer = nextState.players.find((candidate) => candidate.id === player.id)!;
      let needsChoice = false;
      const overflow: Partial<Record<FarmAnimalType, number>> = {};

      (["sheep", "boar", "cattle"] as FarmAnimalType[]).forEach((animal) => {
        if ((births[animal] ?? 0) <= 0) return;
        const before = updatedPlayer.animals[animal];
        updatedPlayer = this.animalManager.addAnimals(updatedPlayer, animal, 1);
        if (updatedPlayer.animals[animal] === before) {
          needsChoice = true;
          overflow[animal] = (overflow[animal] ?? 0) + 1;
        }
      });

      nextState = {
        ...nextState,
        players: nextState.players.map((candidate) => (candidate.id === player.id ? updatedPlayer : candidate)),
        harvestBreeding: {
          ...nextState.harvestBreeding!,
          pendingPlayerIds: needsChoice ? [...nextState.harvestBreeding!.pendingPlayerIds, player.id] : nextState.harvestBreeding!.pendingPlayerIds,
          birthsByPlayerId: {
            ...nextState.harvestBreeding!.birthsByPlayerId,
            [player.id]: births,
          },
          overflowByPlayerId: needsChoice
            ? {
                ...nextState.harvestBreeding!.overflowByPlayerId,
                [player.id]: overflow,
              }
            : nextState.harvestBreeding!.overflowByPlayerId,
        },
      };
    });

    return nextState;
  }

  private finishBreeding(state: GameState): GameState {
    const nextState: GameState = {
      ...state,
      harvestBreeding: null,
      actionLog: [...state.actionLog, "动物繁殖完成。"],
    };

    if (nextState.round >= 14) {
      return this.scoringManager.scoreGame(nextState);
    }

    return this.roundManager.nextRound(nextState);
  }

  private calculateBirths(player: GameState["players"][number]): Partial<Record<FarmAnimalType, number>> {
    const births: Partial<Record<FarmAnimalType, number>> = {};
    (["sheep", "boar", "cattle"] as FarmAnimalType[]).forEach((animal) => {
      if (player.animals[animal] >= 2) births[animal] = 1;
    });
    return births;
  }

  private calculateFieldHarvest(player: GameState["players"][number]): { grain: number; vegetable: number } {
    return player.farm.cells.reduce(
      (summary, cell) => {
        if (cell.field?.crop && cell.field.count > 0) {
          summary[cell.field.crop] += 1;
        }
        return summary;
      },
      { grain: 0, vegetable: 0 },
    );
  }

  private findOverflowAnimalForPlacement(state: GameState, playerId: string, _target: string): FarmAnimalType | null {
    const overflow = state.harvestBreeding?.overflowByPlayerId[playerId] ?? {};
    return (["sheep", "boar", "cattle"] as FarmAnimalType[]).find((animal) => (overflow[animal] ?? 0) > 0) ?? null;
  }

  private assertOverflowResolution(overflow: Partial<Record<FarmAnimalType, number>>, resolution: AnimalOverflowResolution): void {
    const totalOverflow = (["sheep", "boar", "cattle"] as FarmAnimalType[]).reduce((sum, animal) => sum + (overflow[animal] ?? 0), 0);
    const placed = resolution.placements.reduce((sum, placement) => sum + placement.count, 0);
    const cooked = resolution.cooked.reduce((sum, item) => sum + item.count, 0);
    const discarded = resolution.discarded.reduce((sum, item) => sum + item.count, 0);
    if (placed + cooked + discarded > totalOverflow) {
      throw new Error("繁殖处理数量超过可处理的新生动物。");
    }

    (["sheep", "boar", "cattle"] as FarmAnimalType[]).forEach((animal) => {
      const handled =
        resolution.placements.filter((placement) => "animal" in placement && placement.animal === animal).reduce((sum, placement) => sum + placement.count, 0) +
        resolution.cooked.filter((item) => item.animal === animal).reduce((sum, item) => sum + item.count, 0) +
        resolution.discarded.filter((item) => item.animal === animal).reduce((sum, item) => sum + item.count, 0);
      if (handled > (overflow[animal] ?? 0)) {
        throw new Error("繁殖处理数量超过可处理的新生动物。");
      }
    });
  }

  private cookOverflowBirths(player: GameState["players"][number], cooked: AnimalCookInput[]): GameState["players"][number] {
    if (cooked.length === 0) return player;
    if (!this.canCookAnimal(player)) {
      throw new Error("没有可烹饪动物的主要发展卡。");
    }
    const food = cooked.reduce((sum, item) => {
      if (item.count < 0 || !Number.isInteger(item.count)) {
        throw new Error("烹饪数量必须是非负整数。");
      }
      return sum + item.count * this.cookValue(player, item.animal);
    }, 0);
    return {
      ...player,
      resources: {
        ...player.resources,
        food: player.resources.food + food,
      },
    };
  }

  private canCookAnimal(player: GameState["players"][number]): boolean {
    return player.majorImprovements.some((id) => id.startsWith("fireplace") || id.startsWith("cooking-hearth"));
  }

  private cookValue(player: GameState["players"][number], animal: FarmAnimalType): number {
    const hasHearth = player.majorImprovements.some((id) => id.startsWith("cooking-hearth"));
    if (animal === "cattle") return hasHearth ? 4 : 3;
    if (animal === "boar") return hasHearth ? 3 : 2;
    return 2;
  }

  private playerName(state: GameState, playerId: string): string {
    return state.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  private normalizeAmount(value: number): number {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      throw new Error("转换数量必须是非负整数。");
    }
    return value;
  }
}
