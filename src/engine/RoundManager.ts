import { baseActions, type ActionDefinition } from "../config/baseActions";
import { playerExpandActions } from "../config/playerExpandActions";
import { roundActionDefinitions, roundCards } from "../config/roundCards";
import { harvestRounds } from "../config/scoringRules";
import type { ActionSpaceState } from "../state/ActionSpaceState";
import type { GameState } from "../state/GameState";
import { CardManager } from "./CardManager";

export class RoundManager {
  private cardManager = new CardManager();

  createInitialActionSpaces(playerCount: number): ActionSpaceState[] {
    const actionPool = [...baseActions, ...playerExpandActions].filter((action) => action.playerCounts.includes(playerCount));
    return actionPool.map((action) => this.createActionSpace(action));
  }

  createRoundDeck() {
    return roundCards;
  }

  prepareRound(state: GameState): GameState {
    const nextCard = state.roundDeck[0];
    const roundAction = nextCard ? roundActionDefinitions.find((action) => action.id === nextCard.id) : null;
    const actionSpaces = roundAction ? [...state.actionSpaces, this.createActionSpace(roundAction)] : state.actionSpaces;
    const replenished = actionSpaces.map((space) => {
      const source = [...baseActions, ...playerExpandActions, ...roundActionDefinitions].find((action) => action.id === space.id);
      return {
        ...space,
        occupiedBy: null,
        accumulated: this.addRecords(space.accumulated, source?.replenish ?? {}),
      };
    });
    const roundCards = nextCard ? [...state.roundCards, nextCard] : state.roundCards;
    const players = state.players.map((player) => this.cardManager.applyRoundStartFood(player, state.round));

    return {
      ...state,
      phase: "WORK_PHASE",
      stage: "WORK_PHASE",
      harvestField: null,
      harvestFeeding: null,
      harvestBreeding: null,
      roundDeck: state.roundDeck.slice(nextCard ? 1 : 0),
      roundCards,
      actionSpaces: replenished,
      players,
      currentPlayerIndex: this.findStartingPlayerIndex(state),
      currentPlayer: state.startingPlayer,
      actionLog: [...state.actionLog, `第${state.round}轮准备完成。`],
    };
  }

  returnHome(state: GameState): GameState {
    const players = state.players.map((player) => ({
      ...player,
      workers: player.workers.map((worker) => ({
        ...worker,
        location: "home" as const,
        actionSpaceId: null,
      })),
    }));
    const actionSpaces = state.actionSpaces.map((space) => ({ ...space, occupiedBy: null }));
    const isHarvest = harvestRounds.includes(state.round);

    return {
      ...state,
      phase: isHarvest ? "HARVEST" : "NEXT_ROUND",
      stage: isHarvest ? "HARVEST" : "NEXT_ROUND",
      players,
      actionSpaces,
    };
  }

  nextRound(state: GameState): GameState {
    if (state.round >= 14) {
      return state;
    }

    return {
      ...state,
      phase: "ROUND_PREPARE",
      stage: "ROUND_PREPARE",
      round: state.round + 1,
    };
  }

  shouldHarvest(round: number): boolean {
    return harvestRounds.includes(round);
  }

  advanceCurrentPlayer(state: GameState): GameState {
    if (this.allWorkersPlaced(state)) {
      return {
        ...state,
        phase: "RETURN_HOME",
        stage: "RETURN_HOME",
        currentPlayer: null,
      };
    }

    const nextIndex = this.findNextPlayerWithWorker(state);
    return {
      ...state,
      currentPlayerIndex: nextIndex,
      currentPlayer: state.players[nextIndex]?.id ?? null,
    };
  }

  allWorkersPlaced(state: GameState): boolean {
    return state.players.every((player) => player.workers.every((worker) => worker.location !== "home" || worker.availableRound > state.round));
  }

  private createActionSpace(action: ActionDefinition): ActionSpaceState {
    return {
      id: action.id,
      name: action.name,
      type: action.type,
      cost: action.cost,
      gain: action.gain,
      prerequisites: action.prerequisites,
      rules: action.rules,
      restrictions: action.restrictions,
      occupiedBy: null,
      accumulated: {},
      effects: action.effects,
    };
  }

  private addRecords(left: Record<string, number>, right: Record<string, number>): Record<string, number> {
    const next = { ...left };
    Object.entries(right).forEach(([key, value]) => {
      next[key] = (next[key] ?? 0) + value;
    });
    return next;
  }

  private findStartingPlayerIndex(state: GameState): number {
    return Math.max(
      0,
      state.players.findIndex((player) => player.id === state.startingPlayer),
    );
  }

  private findNextPlayerWithWorker(state: GameState): number {
    for (let offset = 1; offset <= state.players.length; offset += 1) {
      const index = (state.currentPlayerIndex + offset) % state.players.length;
      const player = state.players[index];
      if (player?.workers.some((worker) => worker.location === "home" && worker.availableRound <= state.round)) {
        return index;
      }
    }
    return state.currentPlayerIndex;
  }
}
