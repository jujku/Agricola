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

function confirmFieldHarvest(engine: GameEngine, state: ReturnType<GameEngine["advancePhase"]>) {
  let next = state;
  next.players.forEach((player) => {
    next = engine.submitHarvestField(next, player.id);
  });
  return next;
}

function confirmBreeding(engine: GameEngine, state: ReturnType<GameEngine["advancePhase"]>) {
  let next = state;
  next.players.forEach((player) => {
    next = engine.submitHarvestBreeding(next, player.id, { placements: [], cooked: [], discarded: [] });
  });
  return next;
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
    scored = confirmFieldHarvest(engine, scored);
    scored = engine.submitHarvestFeeding(scored, "p1", { grainToFood: 0, vegetableToFood: 0 });
    scored = engine.submitHarvestFeeding(scored, "p2", { grainToFood: 0, vegetableToFood: 0 });
    scored = confirmBreeding(engine, scored);

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
    expect(harvest.harvestField?.submittedPlayerIds).toEqual([]);
    expect(harvest.harvestFeeding).toBeNull();
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

    harvest = confirmFieldHarvest(engine, harvest);
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

    const feeding = confirmFieldHarvest(engine, harvest);
    const rejected = engine.submitHarvestFeeding(feeding, "p1", { grainToFood: 2, vegetableToFood: 0 });

    expect(rejected).toEqual({
      ...feeding,
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

    harvest = confirmFieldHarvest(engine, harvest);
    harvest = engine.submitHarvestFeeding(harvest, "p1", { grainToFood: 4, vegetableToFood: 0 });
    harvest = engine.submitHarvestFeeding(harvest, "p2", { grainToFood: 1, vegetableToFood: 0 });

    expect(harvest.phase).toBe("HARVEST");
    expect(harvest.stage).toBe("HARVEST_BREEDING");
    harvest = confirmBreeding(engine, harvest);

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
    expect(replayedStart.lastError).toBeTruthy();
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
    expect(blocked.lastError).toBeTruthy();
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

  it("builds two rooms in one action with doubled material cost", () => {
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
      { row: 1, col: 1 },
      { row: 0, col: 1 },
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

  it("builds edge fences and detects a two cell pasture capacity", () => {
    const farmManager = new FarmManager();
    const { state } = startTwoPlayerGame();
    const player = {
      ...state.players[0],
      resources: {
        ...state.players[0].resources,
        wood: 10,
      },
    };

    const fenced = farmManager.buildFencesByEdges(player, [
      { row: 0, col: 2, edge: "top" },
      { row: 0, col: 2, edge: "left" },
      { row: 0, col: 2, edge: "right" },
      { row: 1, col: 2, edge: "left" },
      { row: 1, col: 2, edge: "right" },
      { row: 1, col: 2, edge: "bottom" },
    ]);

    expect(fenced.farm.fencesUsed).toBe(6);
    expect(fenced.resources.wood).toBe(4);
    expect(fenced.farm.pastures).toHaveLength(1);
    expect(fenced.farm.pastures[0].cells).toHaveLength(2);
    expect(fenced.farm.pastures[0].capacity).toBe(4);
  });

  it("doubles pasture capacity when a fenced pasture has a stable", () => {
    const farmManager = new FarmManager();
    const { state } = startTwoPlayerGame();
    let player = {
      ...state.players[0],
      resources: {
        ...state.players[0].resources,
        wood: 12,
      },
    };

    player = farmManager.buildStables(player, [{ row: 0, col: 2 }], 1, 1);
    const fenced = farmManager.buildFencesByEdges(player, [
      { row: 0, col: 2, edge: "top" },
      { row: 0, col: 2, edge: "left" },
      { row: 0, col: 2, edge: "right" },
      { row: 1, col: 2, edge: "left" },
      { row: 1, col: 2, edge: "right" },
      { row: 1, col: 2, edge: "bottom" },
    ]);

    expect(fenced.farm.pastures[0].capacity).toBe(8);
  });

  it("does not allow fences touching rooms or fields", () => {
    const farmManager = new FarmManager();
    const { state } = startTwoPlayerGame();
    const player = {
      ...state.players[0],
      resources: {
        ...state.players[0].resources,
        wood: 4,
      },
    };

    expect(() => farmManager.buildFencesByEdges(player, [{ row: 1, col: 0, edge: "right" }])).toThrow();
  });

  it("houses only one animal in the home", () => {
    const farmManager = new FarmManager();
    const { state } = startTwoPlayerGame();
    const player = state.players[0];

    const withOneSheep = farmManager.placeAnimals(player, "sheep", 2, [{ type: "house", count: 1 }]);

    expect(withOneSheep.animals.sheep).toBe(1);
    expect(() => farmManager.placeAnimals(withOneSheep, "sheep", 1, [{ type: "house", count: 1 }])).toThrow();
  });

  it("houses one animal in an unfenced stable", () => {
    const farmManager = new FarmManager();
    const { state } = startTwoPlayerGame();
    const player = {
      ...state.players[0],
      resources: {
        ...state.players[0].resources,
        wood: 1,
      },
    };

    const withStable = farmManager.buildStables(player, [{ row: 0, col: 1 }], 1, 1);
    const withSheep = farmManager.placeAnimals(withStable, "sheep", 1, [{ type: "stable", row: 0, col: 1, count: 1 }]);

    expect(withSheep.animals.sheep).toBe(1);
    expect(withSheep.farm.animalHousing.stables[0].count).toBe(1);
  });

  it("rejects mixed animals inside one pasture", () => {
    const farmManager = new FarmManager();
    const { state } = startTwoPlayerGame();
    const player = {
      ...state.players[0],
      resources: {
        ...state.players[0].resources,
        wood: 4,
      },
    };
    const fenced = farmManager.buildFencesByEdges(player, [
      { row: 0, col: 1, edge: "top" },
      { row: 0, col: 1, edge: "right" },
      { row: 0, col: 1, edge: "bottom" },
      { row: 0, col: 1, edge: "left" },
    ]);
    const withSheep = farmManager.placeAnimals(fenced, "sheep", 1, [{ type: "pasture", pastureId: fenced.farm.pastures[0].id, row: 0, col: 1, count: 1 }]);

    expect(() => farmManager.placeAnimals(withSheep, "boar", 1, [{ type: "pasture", pastureId: fenced.farm.pastures[0].id, row: 0, col: 1, count: 1 }])).toThrow();
  });

  it("stores pasture animals on the selected farm cell", () => {
    const farmManager = new FarmManager();
    const { state } = startTwoPlayerGame();
    const player = {
      ...state.players[0],
      resources: {
        ...state.players[0].resources,
        wood: 6,
      },
    };
    const fenced = farmManager.buildFencesByEdges(player, [
      { row: 0, col: 2, edge: "top" },
      { row: 0, col: 2, edge: "left" },
      { row: 0, col: 2, edge: "right" },
      { row: 1, col: 2, edge: "left" },
      { row: 1, col: 2, edge: "right" },
      { row: 1, col: 2, edge: "bottom" },
    ]);

    const withSheep = farmManager.placeAnimals(fenced, "sheep", 2, [{ type: "pasture", pastureId: fenced.farm.pastures[0].id, row: 1, col: 2, count: 2 }]);

    expect(withSheep.farm.animalHousing.cells).toContainEqual({ row: 1, col: 2, animal: "sheep", count: 2 });
    expect(withSheep.farm.pastures[0].animalCount).toBe(2);
  });

  it("uses animalChoice to resolve one animal from a multi-animal action", () => {
    const engine = new GameEngine();
    let state = engine.createWaitingGame("test");
    state = engine.addPlayer(state, { id: "p1", name: "A" });
    state = engine.addPlayer(state, { id: "p2", name: "B" });
    state = engine.addPlayer(state, { id: "p3", name: "C" });
    state = engine.startGame(state);

    const player = state.players[0];
    const updated = engine.placeWorker(state, player.id, player.workers[0].id, "three-four-flex", {
      selectedEffectTypes: ["gainAnimal"],
      animalChoice: "boar",
      animalPlacement: {
        animal: "boar",
        placements: [{ type: "house", count: 1 }],
        discarded: 0,
      },
    });

    expect(updated.players[0].animals.sheep).toBe(0);
    expect(updated.players[0].animals.boar).toBe(1);
    expect(updated.players[0].animals.cattle).toBe(0);
  });

  it("harvests fields before feeding submissions", () => {
    const { engine, state } = startTwoPlayerGame();
    const player = {
      ...state.players[0],
      farm: {
        ...state.players[0].farm,
        cells: state.players[0].farm.cells.map((cell) =>
          cell.row === 0 && cell.col === 2
            ? {
                ...cell,
                field: { crop: "grain" as const, count: 2 },
              }
            : cell,
        ),
      },
    };

    const harvest = engine.advancePhase({
      ...state,
      round: 4,
      phase: "HARVEST" as const,
      players: [player, state.players[1]],
    });

    expect(harvest.stage).toBe("HARVEST_FIELD");
    expect(harvest.players[0].resources.grain).toBe(state.players[0].resources.grain + 1);
    expect(harvest.players[0].farm.cells.find((cell) => cell.row === 0 && cell.col === 2)?.field?.count).toBe(1);
  });

  it("return home harvest flow reaches field harvest before feeding", () => {
    const { engine, state } = startTwoPlayerGame();
    const player = {
      ...state.players[0],
      farm: {
        ...state.players[0].farm,
        cells: state.players[0].farm.cells.map((cell) =>
          cell.row === 0 && cell.col === 2
            ? {
                ...cell,
                field: { crop: "grain" as const, count: 2 },
              }
            : cell,
        ),
      },
    };

    const returnedHome = engine.advancePhase({
      ...state,
      round: 4,
      phase: "RETURN_HOME" as const,
      players: [player, state.players[1]],
    });
    let harvest = engine.advancePhase(returnedHome);

    expect(returnedHome.phase).toBe("HARVEST");
    expect(harvest.harvestField?.round).toBe(4);
    expect(harvest.players[0].resources.grain).toBe(state.players[0].resources.grain + 1);
    harvest = confirmFieldHarvest(engine, harvest);
    expect(harvest.harvestFeeding?.round).toBe(4);
  });
});


