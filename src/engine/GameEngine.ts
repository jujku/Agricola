import type { GameState } from "../state/GameState";
import type { PlayerState, ResourceState, AnimalState, WorkerState } from "../state/PlayerState";
import type { ActionInput, AnimalOverflowResolution } from "../shared/types";
import { majorImprovements } from "../config/majorImprovements";
import { ActionResolver } from "./ActionResolver";
import { AnimalManager } from "./AnimalManager";
import { FarmManager } from "./FarmManager";
import { HarvestManager } from "./HarvestManager";
import type { HarvestFeedingInput } from "./HarvestManager";
import { RoundManager } from "./RoundManager";

export interface PlayerInput {
  id: string;
  name: string;
}

export class GameEngine {
  private actionResolver = new ActionResolver();
  private animalManager = new AnimalManager();
  private farmManager = new FarmManager();
  private harvestManager = new HarvestManager();
  private roundManager = new RoundManager();

  createWaitingGame(gameId: string): GameState {
    return {
      gameId,
      phase: "WAITING",
      round: 0,
      stage: "WAITING",
      players: [],
      actionSpaces: [],
      roundCards: [],
      currentPlayer: null,
      startingPlayer: null,
      roundDeck: this.roundManager.createRoundDeck(),
      majorImprovements: majorImprovements.map((card) => ({
        id: card.id,
        name: card.name,
        type: "majorImprovement",
        victoryPoints: card.victoryPoints,
        purchasedBy: null,
      })),
      harvestField: null,
      harvestFeeding: null,
      harvestBreeding: null,
      currentPlayerIndex: 0,
      actionLog: [],
      winnerIds: [],
      lastError: null,
    };
  }

  addPlayer(state: GameState, player: PlayerInput): GameState {
    if (state.phase !== "WAITING") {
      return {
        ...state,
        lastError: "游戏已经开始。",
      };
    }
    if (state.players.length >= 6) {
      return {
        ...state,
        lastError: "最多6名玩家。",
      };
    }
    if (state.players.some((existingPlayer) => existingPlayer.id === player.id)) {
      return state;
    }

    return {
      ...state,
      players: [...state.players, this.createPlayer(player, false)],
    };
  }

  startGame(state: GameState): GameState {
    if (state.phase !== "WAITING") {
      return {
        ...state,
        lastError: "游戏已经开始。",
      };
    }
    if (state.players.length < 2 || state.players.length > 6) {
      return {
        ...state,
        lastError: "游戏需要2-6名玩家。",
      };
    }
    const startingPlayer = state.players[0]?.id ?? null;
    const setupState: GameState = {
      ...state,
      phase: "ROUND_PREPARE",
      round: 1,
      stage: "ROUND_PREPARE",
      players: state.players.map((player) =>
        this.createPlayer(
          {
            id: player.id,
            name: player.name,
          },
          player.id === startingPlayer,
        ),
      ),
      currentPlayer: startingPlayer,
      startingPlayer,
      currentPlayerIndex: 0,
      actionSpaces: this.roundManager.createInitialActionSpaces(state.players.length),
      roundCards: [],
      roundDeck: this.roundManager.createRoundDeck(),
      harvestField: null,
      harvestFeeding: null,
      harvestBreeding: null,
      actionLog: ["游戏开始。"],
      lastError: null,
    };

    return this.roundManager.prepareRound(setupState);
  }

  removePlayer(state: GameState, playerId: string): GameState {
    if (state.phase !== "WAITING") {
      return {
        ...state,
        lastError: "游戏已经开始，不能移除玩家。",
      };
    }

    return {
      ...state,
      players: state.players.filter((player) => player.id !== playerId),
      lastError: null,
    };
  }

  unavailableCardNotice(): string {
    return "职业卡和小设施将在未来开放。";
  }

  placeWorker(state: GameState, playerId: string, workerId: string, actionSpaceId: string, input: ActionInput = {}): GameState {
    return this.guard(() => this.actionResolver.placeWorker(state, playerId, workerId, actionSpaceId, input), state);
  }

  advancePhase(state: GameState): GameState {
    return this.guard(() => {
      if (state.phase === "RETURN_HOME") {
        return this.roundManager.returnHome(state);
      }
      if (state.phase === "HARVEST") {
        return this.harvestManager.harvest(state);
      }
      if (state.phase === "NEXT_ROUND") {
        return this.roundManager.nextRound(state);
      }
      if (state.phase === "ROUND_PREPARE") {
        return this.roundManager.prepareRound(state);
      }
      return state;
    }, state);
  }

  submitHarvestFeeding(state: GameState, playerId: string, input: HarvestFeedingInput): GameState {
    return this.guard(() => this.harvestManager.submitFeeding(state, playerId, input), state);
  }

  submitHarvestField(state: GameState, playerId: string): GameState {
    return this.guard(() => this.harvestManager.submitField(state, playerId), state);
  }

  submitHarvestBreeding(state: GameState, playerId: string, resolution: AnimalOverflowResolution): GameState {
    return this.guard(() => this.harvestManager.submitBreeding(state, playerId, resolution), state);
  }

  cookAnimals(state: GameState, playerId: string, improvementId: string, cookedAnimals: Array<{ animal: "sheep" | "boar" | "cattle"; count: number }>): GameState {
    return this.guard(
      () => ({
        ...state,
        players: state.players.map((player) => (player.id === playerId ? this.animalManager.cookAnimalsWithImprovement(player, improvementId, cookedAnimals) : player)),
        actionLog: [
          ...state.actionLog,
          `${state.players.find((player) => player.id === playerId)?.name ?? playerId} 使用大设施烹饪动物。`,
        ],
        lastError: null,
      }),
      state,
    );
  }

  private createPlayer(player: PlayerInput, isStartingPlayer: boolean): PlayerState {
    return {
      id: player.id,
      name: player.name,
      resources: this.createInitialResources(isStartingPlayer),
      animals: this.createInitialAnimals(),
      workers: this.createInitialWorkers(player.id),
      occupations: [],
      minorImprovements: [],
      majorImprovements: [],
      farm: this.createInitialFarm(),
      beggingCards: 0,
      score: null,
      pendingFood: [],
    };
  }

  private createInitialResources(isStartingPlayer: boolean): ResourceState {
    return {
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      grain: 0,
      vegetable: 0,
      food: isStartingPlayer ? 2 : 3,
    };
  }

  private createInitialAnimals(): AnimalState {
    return {
      sheep: 0,
      boar: 0,
      cattle: 0,
    };
  }

  private createInitialWorkers(playerId: string): WorkerState[] {
    return [
      {
        id: `${playerId}-worker-1`,
        location: "home",
        actionSpaceId: null,
        availableRound: 1,
      },
      {
        id: `${playerId}-worker-2`,
        location: "home",
        actionSpaceId: null,
        availableRound: 1,
      },
    ];
  }

  private createInitialFarm() {
    return this.farmManager.createInitialFarm();
  }

  private guard(run: () => GameState, fallback: GameState): GameState {
    try {
      return run();
    } catch (error) {
      return {
        ...fallback,
        lastError: error instanceof Error ? error.message : "未知错误。",
      };
    }
  }
}
