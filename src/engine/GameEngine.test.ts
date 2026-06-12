import { describe, expect, it } from "vitest";
import { AnimalManager } from "./AnimalManager";
import { FarmManager } from "./FarmManager";
import { GameEngine } from "./GameEngine";

function startTwoPlayerGame() {
  const engine = new GameEngine();
  let state = engine.createWaitingGame("test");
  state = engine.addPlayer(state, { id: "p1", name: "A" });
  state = engine.addPlayer(state, { id: "p2", name: "B" });
  return {
    engine,
    state: engine.startGame(state),
  };
}

describe("GameEngine", () => {
  it("initializes a two player game from agent.md rules", () => {
    const { state } = startTwoPlayerGame();

    expect(state.phase).toBe("WORK_PHASE");
    expect(state.round).toBe(1);
    expect(state.players).toHaveLength(2);
    expect(state.players[0].resources.food).toBe(2);
    expect(state.players[1].resources.food).toBe(3);
    expect(state.players[0].workers).toHaveLength(2);
    expect(state.players[0].farm.cells.filter((cell) => cell.room)).toHaveLength(2);
  });

  it("uses configured cumulative player count action spaces", () => {
    const { state } = startTwoPlayerGame();

    expect(state.actionSpaces.some((space) => space.id === "two-player-flex")).toBe(true);
    expect(state.actionSpaces.some((space) => space.id === "three-four-flex")).toBe(false);
  });

  it("reveals one round card and keeps it on the board", () => {
    const { engine, state } = startTwoPlayerGame();
    let nextState = state;
    const player = nextState.players[0];
    const worker = player.workers[0];

    nextState = engine.placeWorker(nextState, player.id, worker.id, "day-laborer");
    expect(nextState.players[0].resources.food).toBe(4);
    expect(nextState.roundCards).toHaveLength(1);
    expect(nextState.actionSpaces.some((space) => space.id === "major-minor-improvement")).toBe(true);
  });

  it("scores final farms and tie winners", () => {
    const { engine, state } = startTwoPlayerGame();
    const ended = {
      ...state,
      round: 14,
      phase: "HARVEST" as const,
      players: state.players.map((player) => ({
        ...player,
        resources: { ...player.resources, food: 10 },
      })),
    };
    let scored = engine.advancePhase(ended);
    scored = engine.submitHarvestFeeding(scored, "p1", { grainToFood: 0, vegetableToFood: 0 });
    scored = engine.submitHarvestFeeding(scored, "p2", { grainToFood: 0, vegetableToFood: 0 });

    expect(scored.phase).toBe("GAME_END");
    expect(scored.players[0].score?.total).toBeTypeOf("number");
    expect(scored.winnerIds.length).toBeGreaterThan(0);
  });

  it("waits for player feeding choices during harvest", () => {
    const { engine, state } = startTwoPlayerGame();
    const harvest = engine.advancePhase({
      ...state,
      round: 4,
      phase: "HARVEST" as const,
      players: state.players.map((player) => ({
        ...player,
        resources: { ...player.resources, food: 0, grain: 2, vegetable: 1 },
      })),
    });

    expect(harvest.phase).toBe("HARVEST");
    expect(harvest.harvestFeeding?.submittedPlayerIds).toEqual([]);
    expect(harvest.players[0].resources.food).toBe(0);
  });

  it("converts grain and vegetables to food at one to one before feeding", () => {
    const { engine, state } = startTwoPlayerGame();
    let harvest = engine.advancePhase({
      ...state,
      round: 4,
      phase: "HARVEST" as const,
      players: state.players.map((player) => ({
        ...player,
        resources: { ...player.resources, food: 0, grain: 2, vegetable: 1 },
      })),
    });

    harvest = engine.submitHarvestFeeding(harvest, "p1", { grainToFood: 2, vegetableToFood: 1 });

    expect(harvest.phase).toBe("HARVEST");
    expect(harvest.players[0].resources.grain).toBe(0);
    expect(harvest.players[0].resources.vegetable).toBe(0);
    expect(harvest.players[0].resources.food).toBe(3);
    expect(harvest.harvestFeeding?.submittedPlayerIds).toEqual(["p1"]);
  });

  it("rejects feeding conversions above available crops", () => {
    const { engine, state } = startTwoPlayerGame();
    const harvest = engine.advancePhase({
      ...state,
      round: 4,
      phase: "HARVEST" as const,
      players: state.players.map((player) => ({
        ...player,
        resources: { ...player.resources, food: 0, grain: 1, vegetable: 0 },
      })),
    });

    const rejected = engine.submitHarvestFeeding(harvest, "p1", { grainToFood: 2, vegetableToFood: 0 });

    expect(rejected).toEqual({
      ...harvest,
      lastError: "谷物不足，不能转换。",
    });
  });

  it("finishes harvest after every player submits feeding", () => {
    const { engine, state } = startTwoPlayerGame();
    let harvest = engine.advancePhase({
      ...state,
      round: 4,
      phase: "HARVEST" as const,
      players: state.players.map((player) => ({
        ...player,
        resources: { ...player.resources, food: 0, grain: 4, vegetable: 0 },
      })),
    });

    harvest = engine.submitHarvestFeeding(harvest, "p1", { grainToFood: 4, vegetableToFood: 0 });
    harvest = engine.submitHarvestFeeding(harvest, "p2", { grainToFood: 1, vegetableToFood: 0 });

    expect(harvest.phase).toBe("ROUND_PREPARE");
    expect(harvest.round).toBe(5);
    expect(harvest.harvestFeeding).toBeNull();
    expect(harvest.players[0].beggingCards).toBe(0);
    expect(harvest.players[1].beggingCards).toBe(3);
  });

  it("does not reset a game after it has already started", () => {
    const { engine, state } = startTwoPlayerGame();
    const replayedStart = engine.startGame({
      ...state,
      round: 3,
      actionLog: [...state.actionLog, "custom marker"],
    });

    expect(replayedStart.round).toBe(3);
    expect(replayedStart.actionLog).toContain("custom marker");
    expect(replayedStart.lastError).toBe("游戏已经开始。");
  });

  it("removes players only while a room is waiting", () => {
    const engine = new GameEngine();
    let waiting = engine.createWaitingGame("test");
    waiting = engine.addPlayer(waiting, { id: "p1", name: "A" });
    waiting = engine.addPlayer(waiting, { id: "p2", name: "B" });

    const removed = engine.removePlayer(waiting, "p1");
    expect(removed.players.map((player) => player.id)).toEqual(["p2"]);

    const started = engine.startGame(waiting);
    const blocked = engine.removePlayer(started, "p1");
    expect(blocked.players.map((player) => player.id)).toEqual(["p1", "p2"]);
    expect(blocked.lastError).toBe("游戏已经开始，不能移除玩家。");
  });

  it("builds multiple rooms as one connected group regardless of input order", () => {
    const farmManager = new FarmManager();
    const { state } = startTwoPlayerGame();
    const player = {
      ...state.players[0],
      resources: {
        ...state.players[0].resources,
        wood: 10,
        reed: 4,
      },
    };

    const updated = farmManager.buildRooms(player, [
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ]);

    expect(updated.farm.cells.filter((cell) => cell.room)).toHaveLength(4);
    expect(updated.resources.wood).toBe(0);
    expect(updated.resources.reed).toBe(0);
  });

  it("does not allow total animal capacity to bypass mixed-animal housing limits", () => {
    const farmManager = new FarmManager();
    const animalManager = new AnimalManager();
    const { state } = startTwoPlayerGame();
    const player = {
      ...state.players[0],
      resources: {
        ...state.players[0].resources,
        wood: 4,
      },
    };
    const fenced = farmManager.buildFences(player, [{ row: 0, col: 1 }]);

    const withSheep = animalManager.addAnimals(fenced, "sheep", 2);
    const withBoarInHouse = animalManager.addAnimals(withSheep, "boar", 1);
    const withRejectedBoar = animalManager.addAnimals(withBoarInHouse, "boar", 1);

    expect(withRejectedBoar.animals.sheep).toBe(2);
    expect(withRejectedBoar.animals.boar).toBe(1);
  });
});
