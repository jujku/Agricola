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
    expect(["major-minor-improvement", "fencing", "sow-bake", "sheep-market"]).toContain(nextState.roundCards[0].id);
    expect(nextState.actionSpaces.some((space) => space.id === nextState.roundCards[0].id)).toBe(true);
  });

  it("keeps round cards in season order while shuffling inside each season", () => {
    const engine = new GameEngine();
    const seasonByCardId: Record<string, number> = {
      "major-minor-improvement": 1,
      fencing: 1,
      "sow-bake": 1,
      "sheep-market": 1,
      "house-redevelopment": 2,
      "western-quarry": 2,
      "family-growth-room": 2,
      "vegetable-seeds": 3,
      "boar-market": 3,
      "eastern-quarry": 4,
      "cattle-market": 4,
      cultivation: 5,
      "family-growth-any": 5,
      "farm-redevelopment": 6,
    };

    const deck = engine.createWaitingGame("deck-test").roundDeck;
    expect(deck).toHaveLength(14);
    expect(new Set(deck.map((card) => card.id)).size).toBe(14);
    expect(deck.map((card) => seasonByCardId[card.id])).toEqual([1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
  });

  it("does not harvest after the first season", () => {
    const { engine, state } = startTwoPlayerGame();
    const returnedHome = engine.advancePhase({
      ...state,
      round: 4,
      phase: "RETURN_HOME" as const,
    });

    expect(returnedHome.phase).toBe("NEXT_ROUND");
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
      round: 7,
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
      round: 7,
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
      round: 7,
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
      round: 7,
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
    expect(harvest.round).toBe(8);
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

  it("executes only the selected option in a choose-one animal action", () => {
    const { engine, state } = startTwoPlayerGame();
    const player = state.players[0];
    const worker = player.workers[0];

    const nextState = engine.placeWorker(state, player.id, worker.id, "two-player-flex", {
      selectedEffectTypes: ["gainAnimal"],
      animalChoice: "boar",
      animalPlacement: { animal: "boar", placements: [], discarded: 1 },
    });

    expect(nextState.players[0].animals.sheep).toBe(0);
    expect(nextState.players[0].animals.boar).toBe(0);
    expect(nextState.players[0].animals.cattle).toBe(0);
  });

  it("executes the nested animal market option from the two player expansion", () => {
    const { engine, state } = startTwoPlayerGame();
    const player = state.players[0];

    const nextState = engine.placeWorker(state, player.id, player.workers[0].id, "two-player-flex", {
      selectedEffectTypes: ["gainAnimal"],
      selectedEffectIds: ["animal-market-boar"],
      animalChoice: "boar",
      animalPlacement: { animal: "boar", placements: [{ type: "house", count: 1 }] },
    });

    expect(nextState.players[0].animals.sheep).toBe(0);
    expect(nextState.players[0].animals.boar).toBe(1);
    expect(nextState.players[0].animals.cattle).toBe(0);
    expect(nextState.players[0].resources.wood).toBe(0);
  });

  it("applies two player animal market food changes", () => {
    const { engine, state } = startTwoPlayerGame();
    const player = state.players[0];

    const sheepState = engine.placeWorker(state, player.id, player.workers[0].id, "two-player-flex", {
      selectedEffectTypes: ["gainAnimal"],
      selectedEffectIds: ["animal-market-sheep"],
      animalChoice: "sheep",
      animalPlacement: { animal: "sheep", placements: [{ type: "house", count: 1 }] },
    });

    expect(sheepState.players[0].animals.sheep).toBe(1);
    expect(sheepState.players[0].resources.food).toBe(player.resources.food + 1);

    const cattleState = engine.placeWorker(
      {
        ...state,
        players: state.players.map((candidate, index) =>
          index === 0 ? { ...candidate, resources: { ...candidate.resources, food: 1 } } : candidate,
        ),
      },
      player.id,
      player.workers[0].id,
      "two-player-flex",
      {
        selectedEffectTypes: ["gainAnimal"],
        selectedEffectIds: ["animal-market-cattle"],
        animalChoice: "cattle",
        animalPlacement: { animal: "cattle", placements: [{ type: "house", count: 1 }] },
      },
    );

    expect(cattleState.players[0].animals.cattle).toBe(1);
    expect(cattleState.players[0].resources.food).toBe(0);
  });

  it("rejects cattle from the two player animal market without food", () => {
    const { engine, state } = startTwoPlayerGame();
    const player = state.players[0];
    const noFoodState = {
      ...state,
      players: state.players.map((candidate, index) => (index === 0 ? { ...candidate, resources: { ...candidate.resources, food: 0 } } : candidate)),
    };

    const nextState = engine.placeWorker(noFoodState, player.id, player.workers[0].id, "two-player-flex", {
      selectedEffectTypes: ["gainAnimal"],
      selectedEffectIds: ["animal-market-cattle"],
      animalChoice: "cattle",
      animalPlacement: { animal: "cattle", placements: [{ type: "house", count: 1 }] },
    });

    expect(nextState.players[0].animals.cattle).toBe(0);
    expect(nextState.lastError).toBe("资源不足。");
  });

  it("gives one stone and one wood from the two player resource market", () => {
    const { engine, state } = startTwoPlayerGame();
    const player = state.players[0];

    const nextState = engine.placeWorker(state, player.id, player.workers[0].id, "two-player-flex", {
      selectedEffectTypes: ["buildingSupplies"],
      selectedEffectIds: ["resource-market"],
    });

    expect(nextState.players[0].resources.stone).toBe(1);
    expect(nextState.players[0].resources.wood).toBe(1);
    expect(nextState.players[0].resources.reed).toBe(0);
    expect(nextState.players[0].resources.food).toBe(player.resources.food);
  });

  it("keeps the two player expansion hierarchy at four top-level actions", () => {
    const { state } = startTwoPlayerGame();
    const actionSpace = state.actionSpaces.find((space) => space.id === "two-player-flex");
    const root = actionSpace?.effects[0];

    expect(root?.type).toBe("chooseOne");
    if (root?.type !== "chooseOne") return;
    expect(root.effects).toHaveLength(4);
    expect(root.effects.map((effect) => effect.label)).toEqual(["小树林", "朴素生孩子", "资源市场", "动物市场"]);
    const animalMarket = root.effects.find((effect) => effect.id === "animal-market");
    expect(animalMarket?.type).toBe("chooseOne");
    if (animalMarket?.type !== "chooseOne") return;
    expect(animalMarket.effects).toHaveLength(3);
  });

  it("executes house redevelopment without occupation or minor-improvement placeholders", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "house-redevelopment-test",
          name: "房屋翻修",
          type: "choice" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "renovate" as const, allowMajorImprovement: true }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, clay: 2, reed: 1 },
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "house-redevelopment-test", {
      selectedEffectTypes: ["renovate"],
      selectedEffectIds: ["renovate:0"],
    });

    expect(nextState.players[0].farm.roomMaterial).toBe("clay");
    expect(nextState.lastError).toBeNull();
  });

  it("executes final redevelopment when only renovation is selected", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "farm-redevelopment-test",
          name: "最终翻修",
          type: "choice" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [
            {
              type: "chooseAny" as const,
              effects: [
                { type: "renovate" as const, id: "final-renovate", allowMajorImprovement: false },
                { type: "buildFences" as const, id: "final-fences" },
              ],
            },
          ],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, clay: 2, reed: 1 },
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "farm-redevelopment-test", {
      selectedEffectTypes: ["renovate"],
      selectedEffectIds: ["final-renovate"],
    });

    expect(nextState.players[0].farm.roomMaterial).toBe("clay");
    expect(nextState.lastError).toBeNull();
  });

  it("bakes bread from the sow and bake action", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "sow-bake-test",
          name: "播种与烤面包",
          type: "choice" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [
            {
              type: "chooseAny" as const,
              effects: [
                { type: "sow" as const, id: "sow-only" },
                { type: "bakeBread" as const, id: "bake-only" },
              ],
            },
          ],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              majorImprovements: ["clay-oven"],
              resources: { ...candidate.resources, grain: 1, food: 0 },
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "sow-bake-test", {
      selectedEffectTypes: ["bakeBread"],
      selectedEffectIds: ["bake-only"],
      bake: { improvementId: "clay-oven", grain: 1 },
    });

    expect(nextState.players[0].resources.grain).toBe(0);
    expect(nextState.players[0].resources.food).toBe(5);
    expect(nextState.lastError).toBeNull();
  });

  it("rejects baking more than one grain with a fireplace", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "sow-bake-test",
          name: "播种与烤面包",
          type: "choice" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "bakeBread" as const, id: "bake-only" }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              majorImprovements: ["fireplace-a"],
              resources: { ...candidate.resources, grain: 2, food: 0 },
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "sow-bake-test", {
      selectedEffectTypes: ["bakeBread"],
      selectedEffectIds: ["bake-only"],
      bake: { improvementId: "fireplace-a", grain: 2 },
    });

    expect(nextState.players[0].resources.grain).toBe(2);
    expect(nextState.players[0].resources.food).toBe(0);
    expect(nextState.lastError).toBe("一次烤面包最多只能烤1个谷物。");
  });

  it("lets the stone oven bake up to two grain in one bake action", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "sow-bake-test",
          name: "播种与烤面包",
          type: "choice" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "bakeBread" as const, id: "bake-only" }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              majorImprovements: ["stone-oven"],
              resources: { ...candidate.resources, grain: 2, food: 0 },
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "sow-bake-test", {
      selectedEffectTypes: ["bakeBread"],
      selectedEffectIds: ["bake-only"],
      bake: { improvementId: "stone-oven", grain: 2 },
    });

    expect(nextState.players[0].resources.grain).toBe(0);
    expect(nextState.players[0].resources.food).toBe(8);
    expect(nextState.lastError).toBeNull();
  });

  it("schedules well food across the next five rounds and collects one per round", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      round: 3,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "buy-major-test",
          name: "购买大设施",
          type: "choice" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "buyMajorImprovement" as const, id: "buy-major" }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, wood: 1, stone: 3, food: 0 },
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const bought = engine.placeWorker(prepared, player.id, player.workers[0].id, "buy-major-test", {
      selectedEffectTypes: ["buyMajorImprovement"],
      selectedEffectIds: ["buy-major"],
      majorImprovementId: "well",
    });

    expect(bought.players[0].pendingFood).toEqual([
      { round: 4, amount: 1 },
      { round: 5, amount: 1 },
      { round: 6, amount: 1 },
      { round: 7, amount: 1 },
      { round: 8, amount: 1 },
    ]);

    const roundFour = engine.advancePhase({
      ...bought,
      phase: "ROUND_PREPARE",
      stage: "ROUND_PREPARE",
      round: 4,
    });

    expect(roundFour.players[0].resources.food).toBe(1);
    expect(roundFour.players[0].pendingFood).toEqual([
      { round: 5, amount: 1 },
      { round: 6, amount: 1 },
      { round: 7, amount: 1 },
      { round: 8, amount: 1 },
    ]);
  });

  it("resolves accumulated quarry resources when the UI sends a generated selection id", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "western-quarry-test",
          name: "西部采石场",
          type: "accumulation" as const,
          cost: {},
          gain: { stone: 1 },
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: { stone: 2 },
          effects: [{ type: "takeAccumulated" as const }],
        },
      ],
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "western-quarry-test", {
      selectedEffectTypes: ["takeAccumulated"],
      selectedEffectIds: ["takeAccumulated:0"],
    });

    expect(nextState.players[0].resources.stone).toBe(2);
    expect(nextState.actionSpaces.find((space) => space.id === "western-quarry-test")?.accumulated).toEqual({});
    expect(nextState.lastError).toBeNull();
  });

  it("resolves direct resource gains when the UI sends a generated selection id", () => {
    const { engine, state } = startTwoPlayerGame();
    const player = state.players[0];

    const nextState = engine.placeWorker(state, player.id, player.workers[0].id, "day-laborer", {
      selectedEffectTypes: ["gainResource"],
      selectedEffectIds: ["gainResource:food:0"],
    });

    expect(nextState.players[0].resources.food).toBe(4);
    expect(nextState.lastError).toBeNull();
  });

  it("resolves choose-any direct actions when the UI sends generated selection ids", () => {
    const { engine, state } = startTwoPlayerGame();
    const player = state.players[0];

    const nextState = engine.placeWorker(state, player.id, player.workers[0].id, "meeting-place", {
      selectedEffectTypes: ["takeStartingPlayer", "gainResource"],
      selectedEffectIds: ["takeStartingPlayer:0", "gainResource:grain:1"],
    });

    expect(nextState.startingPlayer).toBe(player.id);
    expect(nextState.players[0].resources.grain).toBe(1);
    expect(nextState.lastError).toBeNull();
  });

  it("resolves farm picker actions when the UI sends a generated selection id", () => {
    const { engine, state } = startTwoPlayerGame();
    const player = state.players[0];

    const nextState = engine.placeWorker(state, player.id, player.workers[0].id, "farmland", {
      selectedEffectTypes: ["plowField"],
      selectedEffectIds: ["plowField:0"],
      fieldCell: { row: 0, col: 0 },
    });

    const plowedCell = nextState.players[0].farm.cells.find((cell) => cell.row === 0 && cell.col === 0);
    expect(plowedCell?.field).toEqual({ crop: null, count: 0 });
    expect(nextState.lastError).toBeNull();
  });

  it("executes family growth without occupation or minor-improvement placeholders", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "family-growth-room-test",
          name: "生孩子（需要空房）",
          type: "instant" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ id: "family-growth", type: "familyGrowth" as const, requiresRoom: true }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              farm: {
                ...candidate.farm,
                cells: candidate.farm.cells.map((cell) => (cell.row === 0 && cell.col === 0 ? { ...cell, room: true, roomMaterial: "wood" as const } : cell)),
              },
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "family-growth-room-test", {
      selectedEffectTypes: ["familyGrowth"],
      selectedEffectIds: ["family-growth"],
    });

    expect(nextState.players[0].workers).toHaveLength(3);
    expect(nextState.players[0].workers[2].availableRound).toBe(state.round + 1);
    expect(nextState.lastError).toBeNull();
  });

  it("does not let unavailable occupation options block a mixed choose-one action", () => {
    const { engine, state } = startTwoPlayerGame();
    const withFivePlayerSpace = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "five-lessons-copse",
          name: "课程 / 小树林",
          type: "choice" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: { wood: 2 },
          effects: [{ type: "chooseOne" as const, effects: [{ type: "playOccupationPlaceholder" as const }, { type: "takeAccumulated" as const }] }],
        },
      ],
    };
    const player = withFivePlayerSpace.players[0];

    const nextState = engine.placeWorker(withFivePlayerSpace, player.id, player.workers[0].id, "five-lessons-copse");

    expect(nextState.players[0].resources.wood).toBe(2);
    expect(nextState.lastError).toBeNull();
  });

  it("allows the major option when a minor improvement option is unavailable", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "major-minor-improvement",
          name: "大设施 / 小设施",
          type: "choice" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "chooseOne" as const, effects: [{ type: "buyMajorImprovement" as const }, { type: "playMinorImprovementPlaceholder" as const }] }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, clay: 2 },
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "major-minor-improvement", {
      selectedEffectTypes: ["buyMajorImprovement"],
      majorImprovementId: "fireplace-a",
    });

    expect(nextState.players[0].majorImprovements).toContain("fireplace-a");
    expect(nextState.majorImprovements.find((card) => card.id === "fireplace-a")?.purchasedBy).toBe(player.id);
    expect(nextState.lastError).toBeNull();
  });

  it("cooks animals through a purchased major facility", () => {
    const { engine, state } = startTwoPlayerGame();
    const farmManager = new FarmManager();
    const playerWithSheep = farmManager.placeAnimals(
      {
        ...state.players[0],
        resources: { ...state.players[0].resources, clay: 2 },
        majorImprovements: ["fireplace-a"],
      },
      "sheep",
      1,
      [{ type: "house", count: 1 }],
    );
    const prepared = {
      ...state,
      players: [playerWithSheep, state.players[1]],
      majorImprovements: state.majorImprovements.map((card) => (card.id === "fireplace-a" ? { ...card, purchasedBy: "p1" } : card)),
    };

    const cooked = engine.cookAnimals(prepared, "p1", "fireplace-a", [{ animal: "sheep", count: 1 }]);

    expect(cooked.players[0].animals.sheep).toBe(0);
    expect(cooked.players[0].resources.food).toBe(prepared.players[0].resources.food + 2);
    expect(cooked.lastError).toBeNull();
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
      round: 7,
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
      round: 7,
      phase: "RETURN_HOME" as const,
      players: [player, state.players[1]],
    });
    let harvest = engine.advancePhase(returnedHome);

    expect(returnedHome.phase).toBe("HARVEST");
    expect(harvest.harvestField?.round).toBe(7);
    expect(harvest.players[0].resources.grain).toBe(state.players[0].resources.grain + 1);
    harvest = confirmFieldHarvest(engine, harvest);
    expect(harvest.harvestFeeding?.round).toBe(7);
  });
});


