import type { ActionEffect, AnimalKey, ResourceKey } from "../config/baseActions";
import type { ActionInput } from "../shared/types";
import type { GameState } from "../state/GameState";
import type { PlayerState } from "../state/PlayerState";
import { AnimalManager } from "./AnimalManager";
import { CardManager } from "./CardManager";
import { FarmManager } from "./FarmManager";
import { RoundManager } from "./RoundManager";

export class ActionResolver {
  private animalManager = new AnimalManager();
  private cardManager = new CardManager();
  private farmManager = new FarmManager();
  private roundManager = new RoundManager();

  placeWorker(state: GameState, playerId: string, workerId: string, actionSpaceId: string, input: ActionInput = {}): GameState {
    if (state.phase !== "WORK_PHASE") {
      throw new Error("当前不是工人放置阶段。");
    }
    if (state.currentPlayer !== playerId) {
      throw new Error("还没有轮到该玩家行动。");
    }

    const actionSpace = state.actionSpaces.find((space) => space.id === actionSpaceId);
    if (!actionSpace) {
      throw new Error("行动格不存在。");
    }
    if (actionSpace.occupiedBy) {
      throw new Error("行动格已经被占用。");
    }

    const player = this.getPlayer(state, playerId);
    const worker = player.workers.find((candidate) => candidate.id === workerId);
    if (!worker || worker.location !== "home" || worker.availableRound > state.round) {
      throw new Error("工人不可用。");
    }

    let nextState: GameState = {
      ...state,
      actionSpaces: state.actionSpaces.map((space) => (space.id === actionSpaceId ? { ...space, occupiedBy: playerId } : space)),
      players: state.players.map((candidate) =>
        candidate.id === playerId
          ? {
              ...candidate,
              workers: candidate.workers.map((candidateWorker) =>
                candidateWorker.id === workerId
                  ? {
                      ...candidateWorker,
                      location: "action_space" as const,
                      actionSpaceId,
                    }
                  : candidateWorker,
              ),
            }
          : candidate,
      ),
      lastError: null,
    };

    for (const effect of actionSpace.effects) {
      nextState = this.applyEffect(nextState, playerId, actionSpaceId, effect, input);
    }

    return this.roundManager.advanceCurrentPlayer({
      ...nextState,
      actionLog: [...nextState.actionLog, `${player.name} 使用 ${actionSpace.name}。`],
    });
  }

  private applyEffect(state: GameState, playerId: string, actionSpaceId: string, effect: ActionEffect, input: ActionInput): GameState {
    if (effect.type === "chooseAny") {
      return this.resolveNestedEffects(state, playerId, actionSpaceId, effect.effects, input, false);
    }
    if (effect.type === "chooseOne") {
      return this.resolveNestedEffects(state, playerId, actionSpaceId, effect.effects, input, true);
    }
    if (input.selectedEffectTypes && input.selectedEffectTypes.length > 0 && !input.selectedEffectTypes.includes(effect.type)) {
      return state;
    }

    switch (effect.type) {
      case "takeAccumulated":
        return this.takeAccumulated(state, playerId, actionSpaceId, input);
      case "gainResource":
        return this.updatePlayer(state, playerId, (player) => this.gainResource(player, effect.resource, effect.amount));
      case "gainAnimal":
        if (input.animalChoice && input.animalChoice !== effect.animal) {
          return state;
        }
        return this.updatePlayer(state, playerId, (player) =>
          input.animalPlacement
            ? this.animalManager.placeAnimals(player, input.animalPlacement, effect.amount)
            : this.animalManager.addAnimals(player, input.animalChoice ?? effect.animal, effect.amount),
        );
      case "plowField":
        return input.fieldCell ? this.updatePlayer(state, playerId, (player) => this.farmManager.plowField(player, input.fieldCell!)) : state;
      case "buildRooms":
        return this.updatePlayer(state, playerId, (player) => this.farmManager.buildRooms(player, input.roomCells ?? []));
      case "buildStables":
        return this.updatePlayer(state, playerId, (player) => this.farmManager.buildStables(player, input.stableCells ?? [], effect.max, effect.woodCost));
      case "buildFences":
        return this.updatePlayer(state, playerId, (player) =>
          input.fenceSegments
            ? this.farmManager.buildFencesBySegments(player, input.fenceSegments)
            : input.fenceEdges
              ? this.farmManager.buildFencesByEdges(player, input.fenceEdges)
              : this.farmManager.buildFences(player, input.pastureCells ?? []),
        );
      case "sow":
        return this.applySow(state, playerId, input);
      case "bakeBread":
        return input.bake
          ? this.updatePlayer(state, playerId, (player) => this.cardManager.bakeBread(player, input.bake!.improvementId, input.bake!.grain))
          : state;
      case "buyMajorImprovement":
        return input.majorImprovementId ? this.cardManager.buyMajorImprovement(state, playerId, input.majorImprovementId, input) : state;
      case "playOccupationPlaceholder":
      case "playMinorImprovementPlaceholder":
        return { ...state, lastError: "职业卡和次要发展卡将在未来开放。" };
      case "takeStartingPlayer":
        return { ...state, startingPlayer: playerId };
      case "renovate":
        return this.applyRenovation(state, playerId, effect.allowMajorImprovement, input);
      case "familyGrowth":
        return this.updatePlayer(state, playerId, (player) => this.growFamily(player, state.round, effect.requiresRoom, effect.minimumRound));
      case "gainMissingAnimal":
        return this.updatePlayer(state, playerId, (player) => this.gainMissingAnimal(player, input));
      case "buildingSupplies":
        return this.updatePlayer(state, playerId, (player) => this.applyBuildingSupplies(player, input));
      case "farmingSupplies":
        return this.updatePlayer(state, playerId, (player) => this.applyFarmingSupplies(player, input));
      case "sideJob":
        return this.applySideJob(state, playerId, input);
    }
  }

  private resolveNestedEffects(state: GameState, playerId: string, actionSpaceId: string, effects: ActionEffect[], input: ActionInput, chooseOne: boolean): GameState {
    const selected = input.selectedEffectTypes;
    const effectsToApply = selected && selected.length > 0 ? effects.filter((effect) => selected.includes(effect.type)) : chooseOne ? [effects[0]] : effects;
    return effectsToApply.reduce((currentState, effect) => this.applyEffect(currentState, playerId, actionSpaceId, effect, input), state);
  }

  private takeAccumulated(state: GameState, playerId: string, actionSpaceId: string, input: ActionInput): GameState {
    const actionSpace = state.actionSpaces.find((space) => space.id === actionSpaceId);
    if (!actionSpace) {
      return state;
    }

    let nextState = state;
    Object.entries(actionSpace.accumulated).forEach(([key, amount]) => {
      if (this.isResourceKey(key)) {
        nextState = this.updatePlayer(nextState, playerId, (player) => this.gainResource(player, key, amount));
      }
      if (this.isAnimalKey(key)) {
        nextState = this.updatePlayer(nextState, playerId, (player) =>
          input.animalPlacement && input.animalPlacement.animal === key
            ? this.animalManager.placeAnimals(player, input.animalPlacement, amount)
            : this.animalManager.addAnimals(player, key, amount),
        );
      }
    });

    return {
      ...nextState,
      actionSpaces: nextState.actionSpaces.map((space) => (space.id === actionSpaceId ? { ...space, accumulated: {} } : space)),
    };
  }

  private applySow(state: GameState, playerId: string, input: ActionInput): GameState {
    return (input.sow ?? []).reduce(
      (currentState, sowInput) => this.updatePlayer(currentState, playerId, (player) => this.farmManager.sow(player, sowInput.crop, sowInput.cells)),
      state,
    );
  }

  private applyRenovation(state: GameState, playerId: string, allowMajorImprovement: boolean, input: ActionInput): GameState {
    let nextState = this.updatePlayer(state, playerId, (player) => this.farmManager.renovate(player));
    if (allowMajorImprovement && input.majorImprovementId) {
      nextState = this.cardManager.buyMajorImprovement(nextState, playerId, input.majorImprovementId, input);
    }
    return nextState;
  }

  private applySideJob(state: GameState, playerId: string, input: ActionInput): GameState {
    let nextState = this.updatePlayer(state, playerId, (player) => this.farmManager.buildStables(player, input.stableCells ?? [], input.stableCells?.length ?? 0, 1));
    if (input.bake) {
      nextState = this.updatePlayer(nextState, playerId, (player) => this.cardManager.bakeBread(player, input.bake!.improvementId, input.bake!.grain));
    }
    return nextState;
  }

  private applyFarmingSupplies(player: PlayerState, input: ActionInput): PlayerState {
    let nextPlayer = player;
    const grainTrades = input.farmingSupplies?.grainTrades ?? 0;
    if (grainTrades > 0) {
      nextPlayer = this.farmManager.pay(nextPlayer, { food: grainTrades });
      nextPlayer = this.gainResource(nextPlayer, "grain", grainTrades);
    }
    (input.farmingSupplies?.fieldTrades ?? []).forEach((cell) => {
      nextPlayer = this.farmManager.pay(nextPlayer, { food: 1 });
      nextPlayer = this.farmManager.plowField(nextPlayer, cell);
    });
    return nextPlayer;
  }

  private applyBuildingSupplies(player: PlayerState, input: ActionInput): PlayerState {
    let nextPlayer = this.gainResource(player, input.resourceChoices?.first ?? "reed", 1);
    nextPlayer = this.gainResource(nextPlayer, input.resourceChoices?.second ?? "wood", 1);
    return this.gainResource(nextPlayer, "food", 1);
  }

  private growFamily(player: PlayerState, round: number, requiresRoom: boolean, minimumRound?: number): PlayerState {
    if (minimumRound && round < minimumRound) {
      throw new Error("当前回合不满足生孩子前置条件。");
    }
    if (player.workers.length >= 5) {
      throw new Error("家庭成员最多5个。");
    }
    if (requiresRoom && this.farmManager.countEmptyRooms(player) < 1) {
      throw new Error("没有空房间。");
    }
    const workerNumber = player.workers.length + 1;
    return {
      ...player,
      workers: [
        ...player.workers,
        {
          id: `${player.id}-worker-${workerNumber}`,
          location: "home",
          actionSpaceId: null,
          availableRound: round + 1,
        },
      ],
    };
  }

  private gainMissingAnimal(player: PlayerState, input: ActionInput): PlayerState {
    const animalChoice = input.animalChoice;
    const chosenAnimal = animalChoice ?? (["sheep", "boar", "cattle"] as AnimalKey[]).find((animal) => player.animals[animal] === 0);
    if (!chosenAnimal) {
      return player;
    }
    if (player.animals[chosenAnimal] > 0) {
      throw new Error("只能增加一只没有的动物。");
    }
    return input.animalPlacement ? this.animalManager.placeAnimals(player, input.animalPlacement, 1) : this.animalManager.addAnimals(player, chosenAnimal, 1);
  }

  private gainResource(player: PlayerState, resource: ResourceKey, amount: number): PlayerState {
    return {
      ...player,
      resources: {
        ...player.resources,
        [resource]: player.resources[resource] + amount,
      },
    };
  }

  private getPlayer(state: GameState, playerId: string): PlayerState {
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      throw new Error("玩家不存在。");
    }
    return player;
  }

  private updatePlayer(state: GameState, playerId: string, updater: (player: PlayerState) => PlayerState): GameState {
    return {
      ...state,
      players: state.players.map((player) => (player.id === playerId ? updater(player) : player)),
    };
  }

  private isResourceKey(key: string): key is ResourceKey {
    return ["wood", "clay", "reed", "stone", "grain", "vegetable", "food"].includes(key);
  }

  private isAnimalKey(key: string): key is AnimalKey {
    return ["sheep", "boar", "cattle"].includes(key);
  }
}
