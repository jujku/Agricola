import type { GameState } from "../state/GameState";
import type { PlayerState, ResourceState, AnimalState, WorkerState } from "../state/PlayerState";
import type { ActionInput, AnimalOverflowResolution, CookInput } from "../shared/types";
import { majorImprovements } from "../config/majorImprovements";
import { ActionResolver } from "./ActionResolver";
import { AnimalManager } from "./AnimalManager";
import { CardManager } from "./CardManager";
import { FarmManager } from "./FarmManager";
import { HarvestManager } from "./HarvestManager";
import type { HarvestFeedingInput } from "./HarvestManager";
import { RoundManager } from "./RoundManager";

export interface PlayerInput {
  id: string;
  name: string;
  isComputer?: boolean;
}

export class GameEngine {
  private actionResolver = new ActionResolver();
  private animalManager = new AnimalManager();
  private cardManager = new CardManager();
  private farmManager = new FarmManager();
  private harvestManager = new HarvestManager();
  private roundManager = new RoundManager();

  createWaitingGame(gameId: string, options: Partial<GameState["options"]> = {}): GameState {
    return {
      gameId,
      phase: "WAITING",
      round: 0,
      stage: "WAITING",
      options: {
        enableCardDraft: options.enableCardDraft ?? false,
        draftTimeLimitMinutes: options.draftTimeLimitMinutes ?? null,
      },
      hostPlayerId: null,
      readyPlayerIds: [],
      gameEndConfirmedPlayerIds: [],
      players: [],
      actionSpaces: [],
      roundCards: [],
      currentPlayer: null,
      startingPlayer: null,
      pendingActionAccess: null,
      pendingCardChoice: null,
      workPhaseActionCount: 0,
      lastActionOrdinalByPlayerId: {},
      roundDeck: this.roundManager.createRoundDeck(),
      occupationDeck: [],
      minorImprovementDeck: [],
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
      cardDraft: null,
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
      hostPlayerId: state.hostPlayerId ?? player.id,
      readyPlayerIds:
        state.players.length === 0
          ? [player.id]
          : state.readyPlayerIds.filter((playerId) => state.players.some((candidate) => candidate.id === playerId)),
      players: [...state.players, this.createPlayer(player, false)],
    };
  }

  addComputerPlayer(state: GameState): GameState {
    const nextNumber =
      state.players
        .map((player) => /^computer-(\d+)$/.exec(player.id)?.[1])
        .filter((value): value is string => Boolean(value))
        .map((value) => Number(value))
        .reduce((max, value) => Math.max(max, value), 0) + 1;
    const playerId = `computer-${nextNumber}`;
    const added = this.addPlayer(state, {
      id: playerId,
      name: `电脑玩家${nextNumber}`,
      isComputer: true,
    });
    return added.players.some((player) => player.id === playerId)
      ? this.setPlayerReady(added, playerId, true)
      : added;
  }

  setPlayerReady(state: GameState, playerId: string, ready: boolean): GameState {
    if (state.phase !== "WAITING") {
      return state;
    }
    if (!state.players.some((player) => player.id === playerId)) {
      return state;
    }
    const readyPlayerIds = new Set(state.readyPlayerIds);
    if (ready) {
      readyPlayerIds.add(playerId);
    } else if (playerId !== state.hostPlayerId) {
      readyPlayerIds.delete(playerId);
    }
    return {
      ...state,
      readyPlayerIds: Array.from(readyPlayerIds).filter((id) => state.players.some((player) => player.id === id)),
      lastError: null,
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
    if (state.readyPlayerIds.length < state.players.length || state.players.some((player) => !state.readyPlayerIds.includes(player.id))) {
      return {
        ...state,
        lastError: "所有玩家准备后才能开始游戏。",
      };
    }
    const startingPlayer = state.players[0]?.id ?? null;
    const players = state.players.map((player) =>
      this.createPlayer(
        {
          id: player.id,
          name: player.name,
          isComputer: player.isComputer,
        },
        player.id === startingPlayer,
      ),
    );
    if (state.options.enableCardDraft) {
      const dealt = this.cardManager.dealDraftPacks(players, state.players.length);
      return {
        ...state,
        phase: "CARD_DRAFT",
        round: 1,
        stage: "CARD_DRAFT",
        readyPlayerIds: [],
        gameEndConfirmedPlayerIds: [],
        players,
        currentPlayer: null,
        startingPlayer,
        pendingActionAccess: null,
        pendingCardChoice: null,
        workPhaseActionCount: 0,
        lastActionOrdinalByPlayerId: {},
        currentPlayerIndex: 0,
        actionSpaces: [],
        roundCards: [],
        roundDeck: this.roundManager.createRoundDeck(),
        occupationDeck: dealt.occupationDeck,
        minorImprovementDeck: dealt.minorImprovementDeck,
        harvestField: null,
        harvestFeeding: null,
        harvestBreeding: null,
        cardDraft: dealt.cardDraft,
        actionLog: ["游戏开始，进入职业卡和小设施轮抽。"],
        lastError: null,
      };
    }

    const dealt = this.cardManager.dealInitialHands(players, state.players.length);
    return this.prepareFirstRound(state, dealt.players, startingPlayer, dealt.minorImprovementDeck, dealt.occupationDeck, ["游戏开始。"]);
  }

  submitCardDraftPick(state: GameState, playerId: string, minorImprovementId: string, occupationId: string): GameState {
    return this.guard(() => this.resolveCardDraftPick(state, playerId, minorImprovementId, occupationId), state);
  }

  private resolveCardDraftPick(state: GameState, playerId: string, minorImprovementId: string, occupationId: string): GameState {
    if (state.phase !== "CARD_DRAFT" || !state.cardDraft) {
      throw new Error("当前不是轮抽选牌阶段。");
    }
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      throw new Error("玩家不存在。");
    }
    if (state.cardDraft.pendingSelections[playerId]) {
      throw new Error("本轮已经提交过轮抽选择。");
    }
    const pack = state.cardDraft.packs.find((candidate) => candidate.playerId === playerId);
    if (!pack) {
      throw new Error("没有找到你的当前轮抽牌包。");
    }
    if (!pack.minorImprovementIds.includes(minorImprovementId)) {
      throw new Error("这张小设施不在你的当前轮抽牌包中。");
    }
    if (!pack.occupationIds.includes(occupationId)) {
      throw new Error("这张职业卡不在你的当前轮抽牌包中。");
    }

    const nextState: GameState = {
      ...state,
      cardDraft: {
        ...state.cardDraft,
        pendingSelections: {
          ...state.cardDraft.pendingSelections,
          [playerId]: { minorImprovementId, occupationId },
        },
      },
      lastError: null,
    };
    const allSubmitted = nextState.players.every((candidate) => Boolean(nextState.cardDraft?.pendingSelections[candidate.id]));
    return allSubmitted ? this.advanceCardDraft(nextState) : nextState;
  }

  private advanceCardDraft(state: GameState): GameState {
    const draft = state.cardDraft;
    if (!draft) return state;
    const playerIds = state.players.map((player) => player.id);
    const pickedPlayers = state.players.map((player) => {
      const selection = draft.pendingSelections[player.id];
      if (!selection) return player;
      return {
        ...player,
        minorImprovementHand: [...player.minorImprovementHand, selection.minorImprovementId],
        occupationHand: [...player.occupationHand, selection.occupationId],
      };
    });
    const packsAfterPick = draft.packs.map((pack) => {
      const selection = draft.pendingSelections[pack.playerId];
      return {
        ...pack,
        minorImprovementIds: selection ? pack.minorImprovementIds.filter((id) => id !== selection.minorImprovementId) : pack.minorImprovementIds,
        occupationIds: selection ? pack.occupationIds.filter((id) => id !== selection.occupationId) : pack.occupationIds,
      };
    });
    const complete = pickedPlayers.every((player) => player.minorImprovementHand.length >= draft.picksPerPlayer && player.occupationHand.length >= draft.picksPerPlayer);
    const completedRoundLog = `轮抽第 ${draft.round} 轮完成。`;
    if (complete) {
      return this.prepareFirstRound(
        { ...state, players: pickedPlayers, cardDraft: null },
        pickedPlayers,
        state.startingPlayer,
        state.minorImprovementDeck,
        state.occupationDeck,
        [...state.actionLog, completedRoundLog, "轮抽完成，游戏开始。"],
      );
    }

    const rotatedPacks = playerIds.map((playerId, index) => {
      const sourcePlayerId = playerIds[(index - 1 + playerIds.length) % playerIds.length];
      const sourcePack = packsAfterPick.find((pack) => pack.playerId === sourcePlayerId);
      return {
        playerId,
        minorImprovementIds: sourcePack?.minorImprovementIds ?? [],
        occupationIds: sourcePack?.occupationIds ?? [],
      };
    });

    return {
      ...state,
      players: pickedPlayers,
      cardDraft: {
        ...draft,
        round: draft.round + 1,
        packs: rotatedPacks,
        pendingSelections: {},
      },
      actionLog: [...state.actionLog, `${completedRoundLog} 剩余牌包已传给下一名玩家。`],
      lastError: null,
    };
  }

  private prepareFirstRound(
    state: GameState,
    players: GameState["players"],
    startingPlayer: string | null,
    minorImprovementDeck: string[],
    occupationDeck: string[],
    actionLog: string[],
  ): GameState {
    const setupState: GameState = {
      ...state,
      phase: "ROUND_PREPARE",
      round: 1,
      stage: "ROUND_PREPARE",
      readyPlayerIds: [],
      gameEndConfirmedPlayerIds: [],
      players,
      currentPlayer: startingPlayer,
      startingPlayer,
      pendingActionAccess: null,
      pendingCardChoice: null,
      workPhaseActionCount: 0,
      lastActionOrdinalByPlayerId: {},
      currentPlayerIndex: 0,
      actionSpaces: this.roundManager.createInitialActionSpaces(state.players.length),
      roundCards: [],
      roundDeck: this.roundManager.createRoundDeck(),
      occupationDeck,
      minorImprovementDeck,
      harvestField: null,
      harvestFeeding: null,
      harvestBreeding: null,
      cardDraft: null,
      actionLog,
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

    const remainingPlayers = state.players.filter((player) => player.id !== playerId);
    const nextHostPlayerId = state.hostPlayerId === playerId ? remainingPlayers[0]?.id ?? null : state.hostPlayerId;
    const readyPlayerIds = new Set(state.readyPlayerIds.filter((id) => id !== playerId));
    if (nextHostPlayerId) {
      readyPlayerIds.add(nextHostPlayerId);
    }
    return {
      ...state,
      players: remainingPlayers,
      hostPlayerId: nextHostPlayerId,
      readyPlayerIds: Array.from(readyPlayerIds).filter((id) => remainingPlayers.some((player) => player.id === id)),
      lastError: null,
    };
  }

  declareRemainingPlayerWinner(state: GameState, departedPlayerId: string): GameState {
    const remainingPlayers = state.players.filter((player) => player.id !== departedPlayerId);
    if (remainingPlayers.length !== 1) {
      return {
        ...state,
        players: remainingPlayers,
        currentPlayer: state.currentPlayer === departedPlayerId ? remainingPlayers[0]?.id ?? null : state.currentPlayer,
      };
    }
    const winner = remainingPlayers[0];
    return {
      ...state,
      phase: "GAME_END",
      stage: "GAME_END",
      players: remainingPlayers,
      currentPlayer: null,
      winnerIds: [winner.id],
      gameEndConfirmedPlayerIds: [],
      actionLog: [...state.actionLog, `${winner.name} 成为最后留在房间的玩家，直接获胜。`],
      lastError: null,
    };
  }

  unavailableCardNotice(): string {
    return "请通过行动格选择要打出的职业卡或小设施。";
  }

  placeWorker(state: GameState, playerId: string, workerId: string, actionSpaceId: string, input: ActionInput = {}): GameState {
    return this.guard(() => this.actionResolver.placeWorker(state, playerId, workerId, actionSpaceId, input), state);
  }

  submitPendingCardChoice(state: GameState, playerId: string, input: ActionInput = {}): GameState {
    return this.guard(() => this.cardManager.submitPendingCardChoice(state, playerId, input), state);
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
    return this.cookWithMajorImprovement(state, playerId, improvementId, cookedAnimals);
  }

  cookWithMajorImprovement(state: GameState, playerId: string, improvementId: string, cookedAnimals: Array<{ animal: "sheep" | "boar" | "cattle"; count: number }>, cookedItems: CookInput[] = []): GameState {
    return this.guard(
      () => ({
        ...state,
        players: state.players.map((player) =>
          player.id === playerId
            ? this.animalManager.cookItemsWithImprovement(player, improvementId, [...cookedAnimals.map((item) => ({ from: item.animal, count: item.count })), ...cookedItems])
            : player,
        ),
        actionLog: [
          ...state.actionLog,
          `${state.players.find((player) => player.id === playerId)?.name ?? playerId} 使用大设施烹饪。`,
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
      isComputer: player.isComputer,
      resources: this.createInitialResources(isStartingPlayer),
      animals: this.createInitialAnimals(),
      workers: this.createInitialWorkers(player.id),
      occupationHand: [],
      minorImprovementHand: [],
      occupations: [],
      minorImprovements: [],
      majorImprovements: [],
      farm: this.createInitialFarm(),
      beggingCards: 0,
      score: null,
      pendingFood: [],
      pendingGoods: [],
      cardStates: {},
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
