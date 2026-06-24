import { describe, expect, it } from "vitest";
import { AnimalManager } from "./AnimalManager";
import { FarmManager } from "./FarmManager";
import { GameEngine } from "./GameEngine";
import { ScoringManager } from "./ScoringManager";

function startTwoPlayerGame() {
  const engine = new GameEngine();
  let state = engine.createWaitingGame("test");
  state = engine.addPlayer(state, { id: "p1", name: "A" });
  state = engine.addPlayer(state, { id: "p2", name: "B" });
  return {
    engine,
    state: engine.startGame(readyAll(engine, state)),
  };
}

function startFivePlayerGame() {
  const engine = new GameEngine();
  let state = engine.createWaitingGame("test");
  state = engine.addPlayer(state, { id: "p1", name: "A" });
  state = engine.addPlayer(state, { id: "p2", name: "B" });
  state = engine.addPlayer(state, { id: "p3", name: "C" });
  state = engine.addPlayer(state, { id: "p4", name: "D" });
  state = engine.addPlayer(state, { id: "p5", name: "E" });
  return {
    engine,
    state: engine.startGame(readyAll(engine, state)),
  };
}

function readyAll(engine: GameEngine, state: ReturnType<GameEngine["createWaitingGame"]>) {
  let next = state;
  next.players.forEach((player) => {
    next = engine.setPlayerReady(next, player.id, true);
  });
  return next;
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

function playedCardState(cardId: string, playedRound = 1) {
  return {
    cardId,
    playedRound,
    markers: {},
    storedAnimals: {},
    storedGoods: {},
    bonusPoints: 0,
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
    expect(state.players[0].minorImprovementHand).toHaveLength(7);
    expect(state.players[0].occupationHand).toHaveLength(7);
    expect(state.minorImprovementDeck.length).toBeGreaterThan(0);
    expect(state.occupationDeck.length).toBeGreaterThan(0);
  });

  it("deals only occupation cards eligible for the current player count", () => {
    const { state } = startTwoPlayerGame();
    const allOccupationCards = [...state.players.flatMap((player) => player.occupationHand), ...state.occupationDeck];

    expect(allOccupationCards).not.toContain("braggart");
    expect(allOccupationCards).not.toContain("off-sitter");
  });

  it("tracks the host and player readiness while waiting", () => {
    const engine = new GameEngine();
    let state = engine.createWaitingGame("test");
    state = engine.addPlayer(state, { id: "p1", name: "A" });
    state = engine.addPlayer(state, { id: "p2", name: "B" });

    expect(state.hostPlayerId).toBe("p1");
    expect(state.readyPlayerIds).toEqual(["p1"]);

    const notReadyStart = engine.startGame(state);
    expect(notReadyStart.phase).toBe("WAITING");
    expect(notReadyStart.lastError).toBe("所有玩家准备后才能开始游戏。");

    state = engine.setPlayerReady(state, "p2", true);
    expect(state.readyPlayerIds).toEqual(["p1", "p2"]);

    state = engine.setPlayerReady(state, "p2", false);
    expect(state.readyPlayerIds).toEqual(["p1"]);

    state = engine.setPlayerReady(state, "p1", false);
    expect(state.readyPlayerIds).toEqual(["p1"]);
  });

  it("adds computer players as ready waiting-room players", () => {
    const engine = new GameEngine();
    let state = engine.createWaitingGame("test");
    state = engine.addPlayer(state, { id: "p1", name: "A" });

    state = engine.addComputerPlayer(state);
    state = engine.addComputerPlayer(state);

    expect(state.players.map((player) => player.id)).toEqual(["p1", "computer-1", "computer-2"]);
    expect(state.players[1].name).toBe("电脑玩家1");
    expect(state.players[1].isComputer).toBe(true);
    expect([...state.readyPlayerIds].sort()).toEqual(["computer-1", "computer-2", "p1"]);
  });

  it("transfers room ownership when the waiting host leaves", () => {
    const engine = new GameEngine();
    let state = engine.createWaitingGame("test");
    state = engine.addPlayer(state, { id: "p1", name: "A" });
    state = engine.addPlayer(state, { id: "p2", name: "B" });
    state = engine.addPlayer(state, { id: "p3", name: "C" });
    state = engine.setPlayerReady(state, "p3", true);

    const next = engine.removePlayer(state, "p1");

    expect(next.players.map((player) => player.id)).toEqual(["p2", "p3"]);
    expect(next.hostPlayerId).toBe("p2");
    expect([...next.readyPlayerIds].sort()).toEqual(["p2", "p3"]);
  });

  it("declares the remaining player winner when everyone else has left an active game", () => {
    const { engine, state } = startTwoPlayerGame();

    const next = engine.declareRemainingPlayerWinner(state, "p1");

    expect(next.phase).toBe("GAME_END");
    expect(next.stage).toBe("GAME_END");
    expect(next.players.map((player) => player.id)).toEqual(["p2"]);
    expect(next.winnerIds).toEqual(["p2"]);
    expect(next.gameEndConfirmedPlayerIds).toEqual([]);
    expect(next.actionLog.at(-1)).toContain("直接获胜");
  });

  it("runs the optional 7+7 card draft before the first work phase", () => {
    const engine = new GameEngine();
    let waiting = engine.createWaitingGame("draft-test", { enableCardDraft: true });
    waiting = engine.addPlayer(waiting, { id: "p1", name: "A" });
    waiting = engine.addPlayer(waiting, { id: "p2", name: "B" });

    let state = engine.startGame(readyAll(engine, waiting));

    expect(state.phase).toBe("CARD_DRAFT");
    expect(state.cardDraft?.round).toBe(1);
    expect(state.players[0].minorImprovementHand).toHaveLength(0);
    expect(state.players[0].occupationHand).toHaveLength(0);
    expect(state.cardDraft?.packs).toHaveLength(2);
    expect(state.cardDraft?.packs[0].minorImprovementIds).toHaveLength(7);
    expect(state.cardDraft?.packs[0].occupationIds).toHaveLength(7);

    const originalP1SecondMinor = state.cardDraft!.packs[0].minorImprovementIds[1];
    const originalP1SecondOccupation = state.cardDraft!.packs[0].occupationIds[1];
    const originalP2FirstMinor = state.cardDraft!.packs[1].minorImprovementIds[0];
    const originalP2FirstOccupation = state.cardDraft!.packs[1].occupationIds[0];

    state = engine.submitCardDraftPick(state, "p1", state.cardDraft!.packs[0].minorImprovementIds[0], state.cardDraft!.packs[0].occupationIds[0]);
    expect(state.phase).toBe("CARD_DRAFT");
    expect(state.cardDraft?.pendingSelections.p1).toBeTruthy();

    state = engine.submitCardDraftPick(state, "p2", originalP2FirstMinor, originalP2FirstOccupation);
    expect(state.cardDraft?.round).toBe(2);
    expect(state.cardDraft?.pendingSelections).toEqual({});
    expect(state.players[0].minorImprovementHand).toHaveLength(1);
    expect(state.players[0].occupationHand).toHaveLength(1);
    expect(state.cardDraft?.packs.find((pack) => pack.playerId === "p2")?.minorImprovementIds).toContain(originalP1SecondMinor);
    expect(state.cardDraft?.packs.find((pack) => pack.playerId === "p2")?.occupationIds).toContain(originalP1SecondOccupation);

    while (state.phase === "CARD_DRAFT" && state.cardDraft) {
      const draft = state.cardDraft;
      for (const player of state.players) {
        const pack = draft.packs.find((candidate) => candidate.playerId === player.id)!;
        state = engine.submitCardDraftPick(state, player.id, pack.minorImprovementIds[0], pack.occupationIds[0]);
      }
    }

    expect(state.phase).toBe("WORK_PHASE");
    expect(state.cardDraft).toBeNull();
    expect(state.players[0].minorImprovementHand).toHaveLength(7);
    expect(state.players[0].occupationHand).toHaveLength(7);
    expect(state.players[1].minorImprovementHand).toHaveLength(7);
    expect(state.players[1].occupationHand).toHaveLength(7);
  });

  it("plays an occupation from hand through the lessons action space", () => {
    const { engine, state } = startTwoPlayerGame();
    const player = state.players[0];
    const occupationCardId = player.occupationHand[0];

    const nextState = engine.placeWorker(state, player.id, player.workers[0].id, "lessons", {
      selectedEffectTypes: ["playOccupation"],
      occupationCardId,
    });

    expect(nextState.players[0].occupationHand).not.toContain(occupationCardId);
    expect(nextState.players[0].occupations).toContain(occupationCardId);
    expect(nextState.lastError).toBeNull();
  });

  it("does not trigger a just-played occupation's after-action effect during the same action", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, wood: 2 },
              occupationHand: ["paper-maker"],
            }
          : candidate,
      ),
    };

    const nextState = engine.placeWorker(prepared, "p1", prepared.players[0].workers[0].id, "lessons", {
      selectedEffectTypes: ["playOccupation"],
      occupationCardId: "paper-maker",
    });

    expect(nextState.players[0].occupations).toContain("paper-maker");
    expect(nextState.players[0].resources.wood).toBe(2);
    expect(nextState.players[0].resources.food).toBe(prepared.players[0].resources.food);
    expect(nextState.lastError).toBeNull();
  });

  it("plays a minor improvement from hand and pays its configured cost", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "minor-test",
          name: "打出小设施",
          type: "choice" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "playMinorImprovement" as const }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, wood: 3 },
              minorImprovementHand: ["caravan"],
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "minor-test", {
      selectedEffectTypes: ["playMinorImprovement"],
      minorImprovementCardId: "caravan",
    });

    expect(nextState.players[0].resources.wood).toBe(0);
    expect(nextState.players[0].minorImprovementHand).not.toContain("caravan");
    expect(nextState.players[0].minorImprovements).toContain("caravan");
    expect(nextState.lastError).toBeNull();
  });

  it("pays family-scaled resource costs for minor improvements", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "minor-scaled-cost-test",
          name: "打出小设施",
          type: "choice" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "playMinorImprovement" as const }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, clay: 2, food: 2 },
              minorImprovementHand: ["bottles"],
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "minor-scaled-cost-test", {
      selectedEffectTypes: ["playMinorImprovement"],
      minorImprovementCardId: "bottles",
    });

    expect(nextState.players[0].resources.clay).toBe(0);
    expect(nextState.players[0].resources.food).toBe(0);
    expect(nextState.players[0].minorImprovements).toContain("bottles");
    expect(nextState.lastError).toBeNull();
  });

  it("pays animal costs for minor improvements", () => {
    const { engine, state } = startTwoPlayerGame();
    const farmManager = new FarmManager();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "minor-animal-cost-test",
          name: "打出小设施",
          type: "choice" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "playMinorImprovement" as const }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...farmManager.placeAnimals(candidate, "sheep", 1, [{ type: "house", count: 1 }]),
              minorImprovementHand: ["young-animal-market"],
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "minor-animal-cost-test", {
      selectedEffectTypes: ["playMinorImprovement"],
      minorImprovementCardId: "young-animal-market",
    });

    expect(nextState.players[0].animals.sheep).toBe(0);
    expect(nextState.players[0].minorImprovements).not.toContain("young-animal-market");
    expect(nextState.players[1].minorImprovementHand).toContain("young-animal-market");
    expect(nextState.lastError).toBeNull();
  });

  it("passes a passing minor improvement to the next player's hand", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "minor-pass-test",
          name: "打出小设施",
          type: "choice" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "playMinorImprovement" as const }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              minorImprovementHand: ["shifting-cultivation"],
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "minor-pass-test", {
      selectedEffectTypes: ["playMinorImprovement"],
      minorImprovementCardId: "shifting-cultivation",
    });

    expect(nextState.players[0].minorImprovementHand).not.toContain("shifting-cultivation");
    expect(nextState.players[0].resources.food).toBe(0);
    expect(nextState.players[0].minorImprovements).not.toContain("shifting-cultivation");
    expect(nextState.players[1].minorImprovementHand).toContain("shifting-cultivation");
    expect(nextState.lastError).toBeNull();
  });

  it("applies immediate minor improvement effects when a card is played", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "minor-on-play-test",
          name: "打出小设施",
          type: "choice" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "playMinorImprovement" as const }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, wood: 1 },
              minorImprovementHand: ["rammed-clay"],
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "minor-on-play-test", {
      selectedEffectTypes: ["playMinorImprovement"],
      minorImprovementCardId: "rammed-clay",
    });

    expect(nextState.players[0].resources.clay).toBe(1);
    expect(nextState.players[0].minorImprovements).toContain("rammed-clay");
    expect(nextState.players[0].cardStates["rammed-clay"].playedRound).toBe(state.round);
    expect(nextState.lastError).toBeNull();
  });

  it("applies after-action card bonuses through action groups", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              occupationHand: [],
              occupations: ["wood-cutter"],
              cardStates: {
                "wood-cutter": {
                  cardId: "wood-cutter",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "forest");

    expect(nextState.players[0].resources.wood).toBe(4);
    expect(nextState.lastError).toBeNull();
  });

  it("applies claypipe only from the seventh worker placement onward", () => {
    const { engine, state } = startFivePlayerGame();
    const prepareWithPlacedWorkers = (placedBeforeAction: number) => {
      let remainingPlacedWorkers = placedBeforeAction;
      return {
        ...state,
        currentPlayer: "p1",
        currentPlayerIndex: 0,
        workPhaseActionCount: placedBeforeAction,
        players: state.players.map((candidate) => {
          const workers = candidate.workers.map((worker, workerIndex) => {
            if (candidate.id === "p1" && workerIndex === 0) {
              return {
                ...worker,
                location: "home" as const,
                actionSpaceId: null,
              };
            }
            if (remainingPlacedWorkers > 0) {
              const occupiedIndex = placedBeforeAction - remainingPlacedWorkers;
              remainingPlacedWorkers -= 1;
              return {
                ...worker,
                location: "action_space" as const,
                actionSpaceId: `occupied-${occupiedIndex}`,
              };
            }
            return {
              ...worker,
              location: "home" as const,
              actionSpaceId: null,
            };
          });
          return candidate.id === "p1"
            ? {
                ...candidate,
                workers,
                minorImprovements: ["claypipe"],
                cardStates: {
                  claypipe: playedCardState("claypipe"),
                },
              }
            : { ...candidate, workers };
        }),
      };
    };

    const sixthActionState = prepareWithPlacedWorkers(5);
    const sixthAction = engine.placeWorker(sixthActionState, "p1", sixthActionState.players[0].workers[0].id, "day-laborer");
    const sixthReturnHome = engine.advancePhase({ ...sixthAction, phase: "RETURN_HOME", stage: "RETURN_HOME" });
    const seventhActionState = prepareWithPlacedWorkers(6);
    const seventhAction = engine.placeWorker(seventhActionState, "p1", seventhActionState.players[0].workers[0].id, "day-laborer");
    const seventhReturnHome = engine.advancePhase({ ...seventhAction, phase: "RETURN_HOME", stage: "RETURN_HOME" });

    expect(sixthAction.players[0].resources.food).toBe(4);
    expect(sixthReturnHome.players[0].resources.food).toBe(4);
    expect(seventhAction.players[0].resources.food).toBe(4);
    expect(seventhReturnHome.players[0].resources.food).toBe(6);
    expect(seventhReturnHome.lastError).toBeNull();
  });

  it("applies pitchfork only when grain seeds is used before farmland", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepareWithFarmlandOccupied = (farmlandOccupied: boolean) => ({
      ...state,
      actionSpaces: state.actionSpaces.map((space) => (space.id === "farmland" ? { ...space, occupiedBy: farmlandOccupied ? "p2" : null } : space)),
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              minorImprovements: ["pitchfork"],
              cardStates: {
                pitchfork: {
                  cardId: "pitchfork",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
            }
          : candidate,
      ),
    });

    const farmlandEmptyState = prepareWithFarmlandOccupied(false);
    const beforeFarmland = engine.placeWorker(farmlandEmptyState, "p1", farmlandEmptyState.players[0].workers[0].id, "grain-seeds");
    const farmlandOccupiedState = prepareWithFarmlandOccupied(true);
    const afterFarmland = engine.placeWorker(farmlandOccupiedState, "p1", farmlandOccupiedState.players[0].workers[0].id, "grain-seeds");

    expect(beforeFarmland.players[0].resources.food).toBe(5);
    expect(afterFarmland.players[0].resources.food).toBe(2);
    expect(beforeFarmland.lastError).toBeNull();
  });

  it("applies actor-targeted card bonuses without card-specific branches", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "cattle-market",
          name: "牛市场",
          type: "accumulation" as const,
          cost: {},
          gain: { cattle: 1 },
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: { cattle: 1 },
          effects: [{ type: "takeAccumulated" as const }],
        },
      ],
      currentPlayer: "p2",
      currentPlayerIndex: 1,
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, food: 0 },
              minorImprovements: ["milk-jug"],
              cardStates: {
                "milk-jug": {
                  cardId: "milk-jug",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
            }
          : {
              ...candidate,
              resources: { ...candidate.resources, food: 3 },
            },
      ),
    };
    const actor = prepared.players[1];

    const nextState = engine.placeWorker(prepared, actor.id, actor.workers[0].id, "cattle-market", {
      animalPlacement: {
        animal: "cattle",
        placements: [],
        discarded: 1,
      },
    });

    expect(nextState.players[0].resources.food).toBe(3);
    expect(nextState.players[1].resources.food).toBe(4);
    expect(nextState.lastError).toBeNull();
  });

  it("triggers milk jug only from the cattle market", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "boar-market",
          name: "野猪市场",
          type: "accumulation" as const,
          cost: {},
          gain: { boar: 1 },
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: { boar: 1 },
          effects: [{ type: "takeAccumulated" as const }],
        },
        {
          id: "cattle-market",
          name: "牛市场",
          type: "accumulation" as const,
          cost: {},
          gain: { cattle: 1 },
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: { cattle: 1 },
          effects: [{ type: "takeAccumulated" as const }],
        },
      ],
      currentPlayer: "p2",
      currentPlayerIndex: 1,
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, food: 0 },
              minorImprovements: ["milk-jug"],
              cardStates: { "milk-jug": playedCardState("milk-jug") },
            }
          : {
              ...candidate,
              workers: candidate.workers.map((worker) => ({ ...worker, location: "home" as const, actionSpaceId: null })),
            },
      ),
    };

    const boarAction = engine.placeWorker(prepared, "p2", prepared.players[1].workers[0].id, "boar-market", {
      animalPlacement: { animal: "boar", placements: [], discarded: 1 },
    });
    const cattleState = {
      ...prepared,
      actionSpaces: prepared.actionSpaces.map((space) => (space.id === "boar-market" || space.id === "cattle-market" ? { ...space, occupiedBy: null } : space)),
    };
    const cattleAction = engine.placeWorker(cattleState, "p2", cattleState.players[1].workers[0].id, "cattle-market", {
      animalPlacement: { animal: "cattle", placements: [], discarded: 1 },
    });

    expect(boarAction.players[0].resources.food).toBe(0);
    expect(boarAction.players[1].resources.food).toBe(3);
    expect(cattleAction.players[0].resources.food).toBe(3);
    expect(cattleAction.players[1].resources.food).toBe(4);
    expect(cattleAction.lastError).toBeNull();
  });

  it("uses configured animal-market bonuses with payment and selected animal type", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "boar-market",
          name: "野猪市场",
          type: "accumulation" as const,
          cost: {},
          gain: { boar: 1 },
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: { boar: 1 },
          effects: [{ type: "takeAccumulated" as const }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, food: 1 },
              occupations: ["animal-dealer"],
              majorImprovements: ["fireplace-a"],
              cardStates: {
                "animal-dealer": {
                  cardId: "animal-dealer",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
            }
          : candidate,
      ),
    };

    const pendingState = engine.placeWorker(prepared, "p1", prepared.players[0].workers[0].id, "boar-market", {
      animalPlacement: {
        animal: "boar",
        placements: [],
        cooked: 1,
        cookImprovementId: "fireplace-a",
      },
    });
    expect(pendingState.pendingCardChoice?.type).toBe("gainAnimals");
    expect(pendingState.players[0].resources.food).toBe(3);

    const nextState = engine.submitPendingCardChoice(pendingState, "p1", {
      animalPlacement: {
        animal: "boar",
        placements: [{ type: "house", count: 1 }],
        cooked: 0,
        discarded: 0,
      },
    });

    expect(nextState.players[0].resources.food).toBe(2);
    expect(nextState.players[0].animals.boar).toBe(1);
    expect(nextState.pendingCardChoice).toBeNull();
    expect(nextState.lastError).toBeNull();
  });

  it("applies scheduled card goods at round start only once", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      phase: "ROUND_PREPARE" as const,
      stage: "ROUND_PREPARE",
      round: 2,
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              occupations: ["small-scale-farmer"],
              cardStates: {
                "small-scale-farmer": {
                  cardId: "small-scale-farmer",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
            }
          : candidate,
      ),
    };

    const nextState = engine.advancePhase(prepared);

    expect(nextState.players[0].resources.wood).toBe(1);
    expect(nextState.lastError).toBeNull();
  });

  it("applies card cost modifiers to fences", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "fence-discount-test",
          name: "建围栏",
          type: "instant" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "buildFences" as const }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, wood: 1 },
              occupations: ["hedge-keeper"],
              cardStates: {
                "hedge-keeper": {
                  cardId: "hedge-keeper",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "fence-discount-test", {
      selectedEffectTypes: ["buildFences"],
      fenceSegments: [
        { orientation: "horizontal", row: 0, col: 1 },
        { orientation: "horizontal", row: 1, col: 1 },
        { orientation: "vertical", row: 0, col: 1 },
        { orientation: "vertical", row: 0, col: 2 },
      ],
    });

    expect(nextState.players[0].resources.wood).toBe(0);
    expect(nextState.players[0].farm.pastures).toHaveLength(1);
    expect(nextState.lastError).toBeNull();
  });

  it("lets conservator renovate directly from wood to stone", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "renovate-conservator-test",
          name: "翻修",
          type: "instant" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "renovate" as const, allowMajorImprovement: false }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, stone: 2, reed: 1 },
              occupations: ["conservator"],
              cardStates: {
                conservator: {
                  cardId: "conservator",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
            }
          : candidate,
      ),
    };

    const renovated = engine.placeWorker(prepared, "p1", prepared.players[0].workers[0].id, "renovate-conservator-test", {
      selectedEffectTypes: ["renovate"],
    });

    expect(renovated.players[0].farm.roomMaterial).toBe("stone");
    expect(renovated.players[0].resources.stone).toBe(0);
    expect(renovated.players[0].resources.reed).toBe(0);
    expect(renovated.lastError).toBeNull();
  });

  it("lets hayward build fences as a card action without spending a worker or wood", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "free-fence-test",
          name: "建围栏",
          type: "instant" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "buildFences" as const }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, wood: 0 },
              workers: candidate.workers.map((worker) => ({ ...worker, location: "action_space" as const, actionSpaceId: "forest" })),
              occupations: ["hayward"],
              cardStates: {
                hayward: {
                  cardId: "hayward",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
            }
          : candidate,
      ),
    };

    const nextState = engine.placeWorker(prepared, "p1", "p1-card-action", "free-fence-test", {
      selectedEffectTypes: ["buildFences"],
      useCardActionAccess: true,
      fenceSegments: [
        { orientation: "horizontal", row: 0, col: 1 },
        { orientation: "horizontal", row: 1, col: 1 },
        { orientation: "vertical", row: 0, col: 1 },
        { orientation: "vertical", row: 0, col: 2 },
      ],
    });

    expect(nextState.players[0].resources.wood).toBe(0);
    expect(nextState.players[0].farm.pastures).toHaveLength(1);
    expect(nextState.players[0].workers.every((worker) => worker.location === "action_space")).toBe(true);
    expect(nextState.lastError).toBeNull();
  });

  it("scores occupation and minor improvement card effects", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      round: 14,
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              minorImprovements: ["whisky-barrels"],
              occupations: ["stable-architect"],
              farm: {
                ...candidate.farm,
                cells: candidate.farm.cells.map((cell) => (cell.row === 0 && cell.col === 1 ? { ...cell, stable: true } : cell)),
                animalHousing: {
                  ...candidate.farm.animalHousing,
                  stables: [{ row: 0, col: 1, animal: null, count: 0 }],
                },
              },
              cardStates: {
                "whisky-barrels": {
                  cardId: "whisky-barrels",
                  playedRound: 6,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
                "stable-architect": {
                  cardId: "stable-architect",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
            }
          : candidate,
      ),
    };

    const scored = new ScoringManager().scoreGame({
      ...prepared,
    });

    expect(scored.players[0].score?.occupations).toBe(1);
    expect(scored.players[0].score?.bonusPoints).toBeGreaterThanOrEqual(5);
  });

  it("counts beanfield as a virtual vegetable field for requirements and scoring", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      round: 14,
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, wood: 1, grain: 1 },
              occupations: ["wood-cutter", "seasonal-worker"],
              minorImprovementHand: ["strawberry-patch"],
              minorImprovements: ["beanfield"],
              cardStates: {
                beanfield: {
                  cardId: "beanfield",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
              farm: {
                ...candidate.farm,
                cells: candidate.farm.cells.map((cell) =>
                  cell.row === 0 && cell.col === 1
                    ? { ...cell, field: { crop: "vegetable" as const, count: 1 } }
                    : cell,
                ),
              },
            }
          : candidate,
      ),
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "minor-virtual-field-test",
          name: "打出小设施",
          type: "instant" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "playMinorImprovement" as const }],
        },
      ],
    };

    const played = engine.placeWorker(prepared, "p1", prepared.players[0].workers[0].id, "minor-virtual-field-test", {
      selectedEffectTypes: ["playMinorImprovement"],
      minorImprovementCardId: "strawberry-patch",
    });
    const scored = new ScoringManager().scoreGame(played);

    expect(played.players[0].minorImprovements).toContain("strawberry-patch");
    expect(scored.players[0].score?.fields).toBe(1);
    expect(scored.players[0].score?.vegetables).toBe(2);
    expect(played.lastError).toBeNull();
  });

  it("requires three-field rotation to have grain, vegetable, and empty fields", () => {
    const { engine, state } = startTwoPlayerGame();
    const cardState = {
      cardId: "three-field-rotation",
      playedRound: 1,
      markers: {},
      storedAnimals: {},
      storedGoods: {},
      bonusPoints: 0,
    };
    const basePlayer = {
      ...state.players[0],
      resources: { ...state.players[0].resources, food: 0 },
      minorImprovements: ["three-field-rotation"],
      cardStates: { "three-field-rotation": cardState },
      farm: {
        ...state.players[0].farm,
        cells: state.players[0].farm.cells.map((cell) => {
          if (cell.row === 0 && cell.col === 2) return { ...cell, field: { crop: "grain" as const, count: 2 } };
          if (cell.row === 1 && cell.col === 2) return { ...cell, field: { crop: "vegetable" as const, count: 1 } };
          return cell;
        }),
      },
    };
    const withoutEmptyField = engine.advancePhase({
      ...state,
      round: 7,
      phase: "HARVEST" as const,
      players: [basePlayer, { ...state.players[1], resources: { ...state.players[1].resources, food: 4 } }],
    });

    expect(withoutEmptyField.players[0].resources.food).toBe(0);

    const withEmptyField = engine.advancePhase({
      ...state,
      round: 7,
      phase: "HARVEST" as const,
      players: [
        {
          ...basePlayer,
          farm: {
            ...basePlayer.farm,
            cells: basePlayer.farm.cells.map((cell) => (cell.row === 2 && cell.col === 2 ? { ...cell, field: { crop: null, count: 0 } } : cell)),
          },
        },
        { ...state.players[1], resources: { ...state.players[1].resources, food: 4 } },
      ],
    });

    expect(withEmptyField.players[0].resources.food).toBe(3);
    expect(withEmptyField.lastError).toBeNull();
  });

  it("scales card gains by rooms, family members, and crop fields", () => {
    const { engine, state } = startTwoPlayerGame();
    const playOccupationSpace = {
      id: "play-room-scaling-test",
      name: "打出职业",
      type: "instant" as const,
      cost: {},
      gain: {},
      prerequisites: [],
      rules: [],
      restrictions: [],
      occupiedBy: null,
      accumulated: {},
      effects: [{ type: "playOccupation" as const }],
    };
    const roofBallasterState = {
      ...state,
      actionSpaces: [...state.actionSpaces, playOccupationSpace],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, food: 0 },
              occupationHand: ["roof-ballaster"],
              farm: {
                ...candidate.farm,
                cells: candidate.farm.cells.map((cell) => (cell.row === 0 && cell.col === 0 ? { ...cell, room: true, roomMaterial: "wood" as const } : cell)),
              },
            }
          : candidate,
      ),
    };
    const roofPlayed = engine.placeWorker(roofBallasterState, "p1", roofBallasterState.players[0].workers[0].id, "play-room-scaling-test", {
      selectedEffectTypes: ["playOccupation"],
      occupationCardId: "roof-ballaster",
    });

    expect(roofPlayed.players[0].resources.food).toBe(3);

    const harpoonerState = {
      ...state,
      actionSpaces: state.actionSpaces.map((space) => (space.id === "fishing" ? { ...space, accumulated: { food: 2 } } : space)),
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, wood: 1, food: 0 },
              occupations: ["harpooner"],
              cardStates: {
                harpooner: {
                  cardId: "harpooner",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
            }
          : candidate,
      ),
    };
    const fished = engine.placeWorker(harpoonerState, "p1", harpoonerState.players[0].workers[0].id, "fishing");

    expect(fished.players[0].resources.food).toBe(4);
    expect(fished.players[0].resources.wood).toBe(0);
    expect(fished.players[0].resources.reed).toBe(1);

    const unpaidHarpooner = engine.placeWorker(
      {
        ...harpoonerState,
        actionSpaces: harpoonerState.actionSpaces.map((space) => (space.id === "fishing" ? { ...space, accumulated: { food: 2 }, occupiedBy: null } : space)),
        players: harpoonerState.players.map((player, index) =>
          index === 0
            ? {
                ...player,
                resources: { ...player.resources, wood: 0, food: 0, reed: 0 },
                workers: player.workers.map((worker) => ({ ...worker, location: "home" as const, actionSpaceId: null })),
              }
            : player,
        ),
      },
      "p1",
      harpoonerState.players[0].workers[0].id,
      "fishing",
    );
    expect(unpaidHarpooner.players[0].resources.food).toBe(2);
    expect(unpaidHarpooner.players[0].resources.reed).toBe(0);

    const harvest = engine.advancePhase({
      ...state,
      round: 7,
      phase: "HARVEST" as const,
      players: state.players.map((player, index) =>
        index === 0
          ? {
              ...player,
              resources: { ...player.resources, grain: 0, food: 4 },
              occupations: ["scythe-worker"],
              cardStates: {
                "scythe-worker": {
                  cardId: "scythe-worker",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
              farm: {
                ...player.farm,
                cells: player.farm.cells.map((cell) => {
                  if (cell.row === 0 && cell.col === 2) return { ...cell, field: { crop: "grain" as const, count: 2 } };
                  if (cell.row === 1 && cell.col === 2) return { ...cell, field: { crop: "grain" as const, count: 2 } };
                  return cell;
                }),
              },
            }
          : { ...player, resources: { ...player.resources, food: 4 } },
      ),
    });

    expect(harvest.players[0].resources.grain).toBe(4);
    expect(harvest.lastError).toBeNull();
  });

  it("applies high-risk structured occupation and minor improvement conditions", () => {
    const { engine, state } = startFivePlayerGame();
    const farmManager = new FarmManager();
    const playOccupationSpace = {
      id: "play-occupation-structured-test",
      name: "打出职业",
      type: "instant" as const,
      cost: {},
      gain: {},
      prerequisites: [],
      rules: [],
      restrictions: [],
      occupiedBy: null,
      accumulated: {},
      effects: [{ type: "playOccupation" as const }],
    };
    const playMinorSpace = {
      id: "play-minor-structured-test",
      name: "打出小设施",
      type: "instant" as const,
      cost: {},
      gain: {},
      prerequisites: [],
      rules: [],
      restrictions: [],
      occupiedBy: null,
      accumulated: {},
      effects: [{ type: "playMinorImprovement" as const }],
    };

    const wheelmakerState = {
      ...state,
      actionSpaces: [...state.actionSpaces, playOccupationSpace],
      players: state.players.map((candidate, index) => {
        if (index === 0) return { ...candidate, resources: { ...candidate.resources, wood: 4 }, occupationHand: ["wheelmaker"] };
        if (index === 1) return { ...candidate, resources: { ...candidate.resources, wood: 16 }, occupations: ["wood-cutter", "seasonal-worker"] };
        return candidate;
      }),
    };
    const wheelmakerPlayed = engine.placeWorker(wheelmakerState, "p1", wheelmakerState.players[0].workers[0].id, playOccupationSpace.id, {
      selectedEffectTypes: ["playOccupation"],
      occupationCardId: "wheelmaker",
    });
    expect(wheelmakerPlayed.players[0].resources.wood).toBe(15);

    const houseStewardPlayed = engine.placeWorker(
      {
        ...state,
        round: 5,
        actionSpaces: [...state.actionSpaces, { ...playOccupationSpace, id: "play-house-steward-test", occupiedBy: null }],
        players: state.players.map((candidate, index) => (index === 0 ? { ...candidate, occupationHand: ["house-steward"] } : candidate)),
      },
      "p1",
      state.players[0].workers[0].id,
      "play-house-steward-test",
      {
        selectedEffectTypes: ["playOccupation"],
        occupationCardId: "house-steward",
      },
    );
    expect(houseStewardPlayed.players[0].resources.wood).toBe(4);

    const offSitterWithoutFacilities = {
      ...state.players[0],
      occupations: ["off-sitter"],
      cardStates: { "off-sitter": playedCardState("off-sitter") },
    };
    const offSitterWithFacilities = {
      ...offSitterWithoutFacilities,
      majorImprovements: ["well", "stone-oven", "joinery"],
    };
    expect(farmManager.countEmptyRooms(offSitterWithoutFacilities)).toBe(0);
    expect(farmManager.countEmptyRooms(offSitterWithFacilities)).toBe(1);

    const brookRejected = engine.placeWorker(
      {
        ...state,
        actionSpaces: [...state.actionSpaces, playMinorSpace],
        players: state.players.map((candidate, index) => (index === 0 ? { ...candidate, minorImprovementHand: ["brook"] } : candidate)),
      },
      "p1",
      state.players[0].workers[0].id,
      playMinorSpace.id,
      {
        selectedEffectTypes: ["playMinorImprovement"],
        minorImprovementCardId: "brook",
      },
    );
    expect(brookRejected.lastError).toContain("你有 1 个工人在捕鱼行动格");

    const brookPlayed = engine.placeWorker(
      {
        ...state,
        actionSpaces: [...state.actionSpaces.map((space) => (space.id === "fishing" ? { ...space, occupiedBy: "p1" } : space)), playMinorSpace],
        players: state.players.map((candidate, index) =>
          index === 0
            ? {
                ...candidate,
                workers: candidate.workers.map((worker, workerIndex) =>
                  workerIndex === 0 ? { ...worker, location: "action_space" as const, actionSpaceId: "fishing" } : worker,
                ),
                minorImprovementHand: ["brook"],
              }
            : candidate,
        ),
      },
      "p1",
      state.players[0].workers[1].id,
      playMinorSpace.id,
      {
        selectedEffectTypes: ["playMinorImprovement"],
        minorImprovementCardId: "brook",
      },
    );
    expect(brookPlayed.players[0].minorImprovements).toContain("brook");

    const clayHouseWithMantelpiece = {
      ...state.players[0],
      resources: { ...state.players[0].resources, stone: 2, reed: 1 },
      minorImprovements: ["mantelpiece"],
      cardStates: { mantelpiece: playedCardState("mantelpiece") },
      farm: {
        ...state.players[0].farm,
        roomMaterial: "clay" as const,
        cells: state.players[0].farm.cells.map((cell) => (cell.room ? { ...cell, roomMaterial: "clay" as const } : cell)),
      },
    };
    expect(() => farmManager.renovate(clayHouseWithMantelpiece)).toThrow("卡牌效果禁止继续翻修房屋。");

    const fastMasonState = {
      ...state,
      actionSpaces: state.actionSpaces.map((space) => (space.id === "clay-pit" ? { ...space, accumulated: { clay: 2 } } : space)),
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, clay: 0, reed: 0 },
              occupations: ["fast-mason"],
              cardStates: { "fast-mason": playedCardState("fast-mason") },
            }
          : candidate,
      ),
    };
    const fastMasonRenovated = engine.placeWorker(fastMasonState, "p1", fastMasonState.players[0].workers[0].id, "clay-pit");
    expect(fastMasonRenovated.players[0].farm.roomMaterial).toBe("clay");
    expect(fastMasonRenovated.players[0].resources.reed).toBe(0);
  });

  it("checks accumulated resource thresholds for card bonuses", () => {
    const { engine, state } = startFivePlayerGame();
    const prepared = {
      ...state,
      actionSpaces: state.actionSpaces.map((space) => (space.id === "five-hollow" ? { ...space, accumulated: { clay: 2 } } : space)),
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              occupations: ["hollow-gardener"],
              cardStates: {
                "hollow-gardener": {
                  cardId: "hollow-gardener",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
            }
          : candidate,
      ),
    };

    const tooLittle = engine.placeWorker(prepared, "p1", prepared.players[0].workers[0].id, "five-hollow");
    expect(tooLittle.players[0].resources.grain).toBe(0);

    const enough = engine.placeWorker(
      {
        ...prepared,
        actionSpaces: prepared.actionSpaces.map((space) => (space.id === "five-hollow" ? { ...space, accumulated: { clay: 3 }, occupiedBy: null } : space)),
        players: prepared.players.map((player, index) =>
          index === 0
            ? {
                ...player,
                workers: player.workers.map((worker) => ({ ...worker, location: "home" as const, actionSpaceId: null })),
              }
            : player,
        ),
      },
      "p1",
      prepared.players[0].workers[0].id,
      "five-hollow",
    );

    expect(enough.players[0].resources.clay).toBe(3);
    expect(enough.players[0].resources.grain).toBe(1);
    expect(enough.lastError).toBeNull();

    const vegetable = engine.placeWorker(
      {
        ...prepared,
        actionSpaces: prepared.actionSpaces.map((space) => (space.id === "five-hollow" ? { ...space, accumulated: { clay: 6 }, occupiedBy: null } : space)),
        players: prepared.players.map((player, index) =>
          index === 0
            ? {
                ...player,
                resources: { ...player.resources, grain: 0, vegetable: 0 },
                workers: player.workers.map((worker) => ({ ...worker, location: "home" as const, actionSpaceId: null })),
              }
            : player,
        ),
      },
      "p1",
      prepared.players[0].workers[0].id,
      "five-hollow",
    );

    expect(vegetable.players[0].resources.grain).toBe(0);
    expect(vegetable.players[0].resources.vegetable).toBe(1);
    expect(vegetable.lastError).toBeNull();
  });

  it("uses new pasture context for shepherds crook and bovine pioneer", () => {
    const { engine, state } = startFivePlayerGame();
    const pastureState = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "large-pasture-test",
          name: "大牧场测试",
          type: "instant" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "buildFences" as const }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, wood: 10 },
              minorImprovements: ["shepherds-crook"],
              cardStates: {
                "shepherds-crook": playedCardState("shepherds-crook"),
              },
            }
          : candidate,
      ),
    };

    const fencedPending = engine.placeWorker(pastureState, "p1", pastureState.players[0].workers[0].id, "large-pasture-test", {
      selectedEffectTypes: ["buildFences"],
      pastureCells: [
        { row: 0, col: 1 },
        { row: 0, col: 2 },
        { row: 1, col: 1 },
        { row: 1, col: 2 },
      ],
    });
    expect(fencedPending.pendingCardChoice?.type).toBe("gainAnimals");
    const fencedPasture = fencedPending.players[0].farm.pastures[0];
    const fenced = engine.submitPendingCardChoice(fencedPending, "p1", {
      animalPlacement: {
        animal: "sheep",
        placements: [{ type: "pasture", pastureId: fencedPasture.id, row: fencedPasture.cells[0].row, col: fencedPasture.cells[0].col, count: 2 }],
        cooked: 0,
        discarded: 0,
      },
    });

    expect(fenced.players[0].animals.sheep).toBe(2);
    expect(fenced.pendingCardChoice).toBeNull();
    expect(fenced.lastError).toBeNull();

    const bovineState = {
      ...state,
      actionSpaces: pastureState.actionSpaces,
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, wood: 4 },
              occupations: ["bovine-pioneer"],
              cardStates: { "bovine-pioneer": playedCardState("bovine-pioneer") },
            }
          : candidate,
      ),
    };
    const pioneeredPending = engine.placeWorker(bovineState, "p1", bovineState.players[0].workers[0].id, "large-pasture-test", {
      selectedEffectTypes: ["buildFences"],
      pastureCells: [{ row: 0, col: 1 }],
    });
    expect(pioneeredPending.pendingCardChoice?.type).toBe("gainAnimals");
    const pioneerPasture = pioneeredPending.players[0].farm.pastures[0];
    const pioneered = engine.submitPendingCardChoice(pioneeredPending, "p1", {
      animalPlacement: {
        animal: "cattle",
        placements: [{ type: "pasture", pastureId: pioneerPasture.id, row: pioneerPasture.cells[0].row, col: pioneerPasture.cells[0].col, count: 1 }],
        cooked: 0,
        discarded: 0,
      },
    });

    expect(pioneered.players[0].animals.cattle).toBe(1);
    expect(pioneered.pendingCardChoice).toBeNull();
    expect(pioneered.lastError).toBeNull();
  });

  it("resolves card stored food and claims it once at return home", () => {
    const { engine, state } = startFivePlayerGame();
    const prepared = {
      ...state,
      currentPlayer: "p2",
      currentPlayerIndex: 1,
      actionSpaces: state.actionSpaces.map((space) => (space.id === "farmland" ? { ...space, occupiedBy: null } : space)),
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, food: 0 },
              occupations: ["field-counter"],
              cardStates: { "field-counter": playedCardState("field-counter") },
            }
          : candidate,
      ),
    };

    const plowed = engine.placeWorker(prepared, "p2", prepared.players[1].workers[0].id, "farmland", {
      fieldCell: { row: 0, col: 1 },
    });
    expect(plowed.players[0].resources.food).toBe(0);
    expect(plowed.players[0].cardStates["field-counter"].storedGoods.food).toBe(1);

    const returnedHome = engine.advancePhase({
      ...plowed,
      phase: "RETURN_HOME",
      stage: "RETURN_HOME",
    });
    expect(returnedHome.players[0].resources.food).toBe(1);
    expect(returnedHome.players[0].cardStates["field-counter"].storedGoods.food).toBeUndefined();

    const returnedAgain = engine.advancePhase({
      ...returnedHome,
      phase: "RETURN_HOME",
      stage: "RETURN_HOME",
      actionSpaces: returnedHome.actionSpaces.map((space) => (space.id === "farmland" ? { ...space, occupiedBy: "p2" } : space)),
    });
    expect(returnedAgain.players[0].resources.food).toBe(1);
  });

  it("uses conditional return-home card triggers before action spaces are cleared", () => {
    const { engine, state } = startFivePlayerGame();
    const prepared = {
      ...state,
      phase: "RETURN_HOME" as const,
      stage: "RETURN_HOME",
      actionSpaces: state.actionSpaces.map((space) => {
        if (space.id === "fishing") return { ...space, occupiedBy: "p2" };
        if (space.id === "five-build-room-traveling") return { ...space, occupiedBy: "p3" };
        if (space.id === "forest" || space.id === "five-grove" || space.id === "five-riverbank-forest") return { ...space, occupiedBy: "p4" };
        return space;
      }),
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, wood: 1, grain: 0 },
              occupations: ["boat-painter", "wild-boar-hunter"],
              cardStates: {
                "boat-painter": playedCardState("boat-painter"),
                "wild-boar-hunter": playedCardState("wild-boar-hunter"),
              },
            }
          : candidate,
      ),
    };

    const returnedHomePending = engine.advancePhase(prepared);

    expect(returnedHomePending.pendingCardChoice?.type).toBe("gainAnimals");
    expect(returnedHomePending.players[0].resources.grain).toBe(1);
    expect(returnedHomePending.players[0].resources.wood).toBe(1);
    const returnedHome = engine.submitPendingCardChoice(returnedHomePending, "p1", {
      animalPlacement: {
        animal: "boar",
        placements: [{ type: "house", count: 1 }],
        cooked: 0,
        discarded: 0,
      },
    });

    expect(returnedHome.players[0].resources.wood).toBe(0);
    expect(returnedHome.players[0].animals.boar).toBe(1);
    expect(returnedHome.pendingCardChoice).toBeNull();
    expect(returnedHome.actionSpaces.every((space) => !space.occupiedBy)).toBe(true);
    expect(returnedHome.lastError).toBeNull();
  });

  it("does not trigger return-home occupation rewards when shared conditions fail", () => {
    const { engine, state } = startFivePlayerGame();
    const prepared = {
      ...state,
      phase: "RETURN_HOME" as const,
      stage: "RETURN_HOME",
      actionSpaces: state.actionSpaces.map((space) => {
        if (space.id === "fishing") return { ...space, occupiedBy: "p2" };
        if (space.id === "forest" || space.id === "five-grove") return { ...space, occupiedBy: "p4" };
        return space;
      }),
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, wood: 1, grain: 0 },
              occupations: ["boat-painter", "wild-boar-hunter"],
              cardStates: {
                "boat-painter": playedCardState("boat-painter"),
                "wild-boar-hunter": playedCardState("wild-boar-hunter"),
              },
            }
          : candidate,
      ),
    };

    const returnedHome = engine.advancePhase(prepared);

    expect(returnedHome.players[0].resources.grain).toBe(0);
    expect(returnedHome.players[0].resources.wood).toBe(1);
    expect(returnedHome.players[0].animals.boar).toBe(0);
    expect(returnedHome.lastError).toBeNull();
  });

  it("applies condition-count thresholds for cattle caregiver and stone custodian", () => {
    const { engine, state } = startFivePlayerGame();
    const cattleCaregiverState = {
      ...state,
      phase: "ROUND_PREPARE" as const,
      stage: "ROUND_PREPARE",
      round: 2,
      players: state.players.map((candidate, index) => ({
        ...candidate,
        animals: { ...candidate.animals, cattle: index < 4 ? 1 : 0 },
        occupations: index === 0 ? ["cattle-caregiver"] : candidate.occupations,
        cardStates: index === 0 ? { "cattle-caregiver": playedCardState("cattle-caregiver") } : candidate.cardStates,
      })),
    };
    const caredForCattle = engine.advancePhase(cattleCaregiverState);

    const stoneCustodianState = {
      ...state,
      phase: "RETURN_HOME" as const,
      stage: "RETURN_HOME",
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "western-quarry",
          name: "西部采石场",
          type: "accumulation" as const,
          cost: {},
          gain: { stone: 1 },
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: { stone: 1 },
          effects: [{ type: "takeAccumulated" as const }],
        },
        {
          id: "eastern-quarry",
          name: "东部采石场",
          type: "accumulation" as const,
          cost: {},
          gain: { stone: 1 },
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: { stone: 1 },
          effects: [{ type: "takeAccumulated" as const }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              occupations: ["stone-custodian"],
              cardStates: { "stone-custodian": playedCardState("stone-custodian") },
            }
          : candidate,
      ),
    };
    const guardedStone = engine.advancePhase(stoneCustodianState);

    expect(caredForCattle.players[0].resources.food).toBe(4);
    expect(guardedStone.players[0].resources.grain).toBe(0);
    expect(guardedStone.players[0].resources.vegetable).toBe(1);
    expect(guardedStone.lastError).toBeNull();
  });

  it("uses accumulated food thresholds for game taster animal rewards", () => {
    const { engine, state } = startFivePlayerGame();
    const farmManager = new FarmManager();
    const prepared = {
      ...state,
      actionSpaces: state.actionSpaces.map((space) => (space.id === "fishing" ? { ...space, accumulated: { food: 3 } } : space)),
      players: state.players.map((candidate, index) => {
        if (index !== 0) return candidate;
        const withStables = farmManager.buildStables(
          {
            ...candidate,
            resources: { ...candidate.resources, wood: 4 },
          },
          [
            { row: 0, col: 1 },
            { row: 0, col: 2 },
          ],
          2,
          2,
        );
        return {
          ...withStables,
          occupations: ["game-taster"],
          cardStates: {
            "game-taster": {
              cardId: "game-taster",
              playedRound: 1,
              markers: {},
              storedAnimals: {},
              storedGoods: {},
              bonusPoints: 0,
            },
          },
        };
      }),
    };

    let nextState = engine.placeWorker(prepared, "p1", prepared.players[0].workers[0].id, "fishing");

    expect(nextState.players[0].resources.food).toBe(5);
    expect(nextState.pendingCardChoice?.type).toBe("gainAnimals");
    nextState = engine.submitPendingCardChoice(nextState, "p1", {
      animalPlacement: {
        animal: "cattle",
        placements: [{ type: "stable", row: 0, col: 1, count: 1 }],
        cooked: 0,
        discarded: 0,
      },
    });
    expect(nextState.pendingCardChoice?.type).toBe("gainAnimals");
    nextState = engine.submitPendingCardChoice(nextState, "p1", {
      animalPlacement: {
        animal: "boar",
        placements: [{ type: "stable", row: 0, col: 2, count: 1 }],
        cooked: 0,
        discarded: 0,
      },
    });
    expect(nextState.pendingCardChoice?.type).toBe("gainAnimals");
    nextState = engine.submitPendingCardChoice(nextState, "p1", {
      animalPlacement: {
        animal: "sheep",
        placements: [{ type: "house", count: 1 }],
        cooked: 0,
        discarded: 0,
      },
    });

    expect(nextState.players[0].animals.cattle).toBe(1);
    expect(nextState.players[0].animals.boar).toBe(1);
    expect(nextState.players[0].animals.sheep).toBe(1);
    expect(nextState.pendingCardChoice).toBeNull();
    expect(nextState.lastError).toBeNull();
  });

  it("uses harvested crop thresholds for field overseer rewards from other players", () => {
    const { engine, state } = startFivePlayerGame();
    const harvestState = {
      ...state,
      round: 4,
      phase: "HARVEST" as const,
      players: state.players.map((player, index) => {
        if (index === 0) {
          return {
            ...player,
            resources: { ...player.resources, food: 4, vegetable: 0 },
            occupations: ["field-overseer"],
            cardStates: { "field-overseer": playedCardState("field-overseer") },
          };
        }
        if (index === 1) {
          return {
            ...player,
            resources: { ...player.resources, food: 4 },
            farm: {
              ...player.farm,
              cells: player.farm.cells.map((cell) =>
                cell.row < 2 && cell.col >= 1 && cell.col <= 3
                  ? { ...cell, field: { crop: "grain" as const, count: 2 } }
                  : cell,
              ),
            },
          };
        }
        return { ...player, resources: { ...player.resources, food: 4 } };
      }),
    };

    const harvested = engine.advancePhase(harvestState);

    expect(harvested.players[0].resources.vegetable).toBe(1);
    expect(harvested.players[0].resources.food).toBe(4);
    expect(harvested.lastError).toBeNull();
  });

  it("uses occupied lesson count thresholds for village teacher", () => {
    const { engine, state } = startFivePlayerGame();
    const prepared = {
      ...state,
      actionSpaces: state.actionSpaces.map((space) => {
        if (space.id === "lessons") return { ...space, occupiedBy: "p2" };
        if (space.id === "five-lessons-copse") return { ...space, occupiedBy: "p3" };
        if (space.id === "five-lessons-family") return { ...space, effects: [{ type: "gainResource" as const, resource: "food" as const, amount: 0 }] };
        return space;
      }),
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              occupations: ["village-teacher"],
              cardStates: { "village-teacher": playedCardState("village-teacher") },
            }
          : candidate,
      ),
    };

    const taught = engine.placeWorker(prepared, "p1", prepared.players[0].workers[0].id, "five-lessons-family");

    expect(taught.players[0].resources.vegetable).toBe(1);
    expect(taught.lastError).toBeNull();
  });

  it("returns accumulated goods and gains threshold animals for part-time worker", () => {
    const { engine, state } = startFivePlayerGame();
    const farmManager = new FarmManager();
    const prepared = {
      ...state,
      actionSpaces: state.actionSpaces.map((space) => (space.id === "forest" ? { ...space, accumulated: { wood: 4 } } : space)),
      players: state.players.map((candidate, index) => {
        if (index !== 0) return candidate;
        const fenced = farmManager.createFreePasture(
          {
            ...candidate,
            resources: { ...candidate.resources, food: 1, wood: 0 },
          },
          1,
        );
        return {
          ...fenced,
          occupations: ["part-time-worker"],
          cardStates: { "part-time-worker": playedCardState("part-time-worker") },
        };
      }),
    };

    const worked = engine.placeWorker(prepared, "p1", prepared.players[0].workers[0].id, "forest");

    expect(worked.players[0].resources.wood).toBe(2);
    expect(worked.players[0].animals.boar).toBe(1);
    expect(worked.actionSpaces.find((space) => space.id === "forest")?.accumulated.wood).toBe(2);
    expect(worked.lastError).toBeNull();
  });

  it("applies tag-along deterministic resource market rewards", () => {
    const { engine, state } = startFivePlayerGame();
    const prepared = {
      ...state,
      currentPlayer: "p2",
      currentPlayerIndex: 1,
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              occupations: ["tag-along"],
              cardStates: { "tag-along": playedCardState("tag-along") },
            }
          : candidate,
      ),
    };

    const followed = engine.placeWorker(prepared, "p2", prepared.players[1].workers[0].id, "five-resource-market");

    expect(followed.players[0].resources.reed).toBe(1);
    expect(followed.players[0].resources.stone).toBe(1);
    expect(followed.players[0].resources.wood).toBe(1);
    expect(followed.lastError).toBeNull();
  });

  it("claims traveling player food for top-outer when the build-room option is used", () => {
    const { engine, state } = startFivePlayerGame();
    const prepared = {
      ...state,
      actionSpaces: state.actionSpaces.map((space) => (space.id === "five-build-room-traveling" ? { ...space, accumulated: { food: 3 } } : space)),
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, wood: 5, reed: 2, food: 0 },
              occupations: ["top-outer"],
              cardStates: { "top-outer": playedCardState("top-outer") },
            }
          : candidate,
      ),
    };

    const built = engine.placeWorker(prepared, "p1", prepared.players[0].workers[0].id, "five-build-room-traveling", {
      selectedEffectTypes: ["buildRooms"],
      roomCells: [{ row: 0, col: 0 }],
    });

    expect(built.players[0].resources.food).toBe(3);
    expect(built.actionSpaces.find((space) => space.id === "five-build-room-traveling")?.accumulated.food).toBe(0);
    expect(built.lastError).toBeNull();
  });

  it("requires plowsmith cost and wood threshold before plowing for another player's wood action", () => {
    const { engine, state } = startFivePlayerGame();
    const prepared = {
      ...state,
      currentPlayer: "p2",
      currentPlayerIndex: 1,
      actionSpaces: state.actionSpaces.map((space) => (space.id === "five-grove" ? { ...space, accumulated: { wood: 4 } } : space)),
      players: state.players.map((candidate, index) => {
        if (index === 0) {
          return {
            ...candidate,
            resources: { ...candidate.resources, food: 1 },
            occupations: ["plowsmith"],
            cardStates: {
              plowsmith: {
                cardId: "plowsmith",
                playedRound: 1,
                markers: {},
                storedAnimals: {},
                storedGoods: {},
                bonusPoints: 0,
              },
            },
          };
        }
        return candidate;
      }),
    };
    const actor = prepared.players[1];

    const plowedPending = engine.placeWorker(prepared, actor.id, actor.workers[0].id, "five-grove");

    expect(plowedPending.pendingCardChoice?.type).toBe("plowField");
    expect(plowedPending.players[0].resources.food).toBe(1);
    const plowed = engine.submitPendingCardChoice(plowedPending, "p1", {
      fieldCell: { row: 0, col: 1 },
    });

    expect(plowed.players[0].resources.food).toBe(0);
    expect(plowed.players[0].farm.cells.filter((cell) => cell.field)).toHaveLength(1);
    expect(plowed.players[1].resources.wood).toBe(4);
    expect(plowed.pendingCardChoice).toBeNull();
    expect(plowed.lastError).toBeNull();

    const noFood = engine.placeWorker(
      {
        ...prepared,
        actionSpaces: prepared.actionSpaces.map((space) => (space.id === "five-grove" ? { ...space, occupiedBy: null } : space)),
        players: prepared.players.map((player, index) =>
          index === 0
            ? { ...player, resources: { ...player.resources, food: 0 } }
            : { ...player, workers: player.workers.map((worker) => ({ ...worker, location: "home" as const, actionSpaceId: null })) },
        ),
      },
      actor.id,
      actor.workers[0].id,
      "five-grove",
    );

    expect(noFood.players[0].farm.cells.filter((cell) => cell.field)).toHaveLength(0);
    expect(noFood.lastError).toBeNull();
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

  it("scores workshop resource bonuses at game end", () => {
    const { engine, state } = startTwoPlayerGame();
    const ended = {
      ...state,
      round: 14,
      phase: "HARVEST" as const,
      players: state.players.map((player, index) => ({
        ...player,
        resources: index === 0 ? { ...player.resources, food: 10, wood: 3 } : { ...player.resources, food: 10 },
        majorImprovements: index === 0 ? ["joinery"] : player.majorImprovements,
      })),
    };
    let scored = engine.advancePhase(ended);
    scored = confirmFieldHarvest(engine, scored);
    scored = engine.submitHarvestFeeding(scored, "p1", { grainToFood: 0, vegetableToFood: 0 });
    scored = engine.submitHarvestFeeding(scored, "p2", { grainToFood: 0, vegetableToFood: 0 });
    scored = confirmBreeding(engine, scored);

    expect(scored.players[0].score?.majorImprovements).toBe(2);
    expect(scored.players[0].score?.bonusPoints).toBe(1);
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

  it("uses workshop harvest conversions only when selected during feeding", () => {
    const { engine, state } = startTwoPlayerGame();
    let harvest = engine.advancePhase({
      ...state,
      round: 7,
      phase: "HARVEST" as const,
      players: state.players.map((player, index) => ({
        ...player,
        resources: index === 0 ? { ...player.resources, food: 0, wood: 1 } : { ...player.resources, food: 4 },
        majorImprovements: index === 0 ? ["joinery"] : player.majorImprovements,
      })),
    });

    harvest = confirmFieldHarvest(engine, harvest);
    harvest = engine.submitHarvestFeeding(harvest, "p1", { grainToFood: 0, vegetableToFood: 0 });

    expect(harvest.players[0].resources.wood).toBe(1);
    expect(harvest.players[0].resources.food).toBe(0);
    expect(harvest.players[0].beggingCards).toBe(0);

    harvest = engine.submitHarvestFeeding(harvest, "p2", { grainToFood: 0, vegetableToFood: 0 });
    harvest = confirmBreeding(engine, harvest);

    expect(harvest.players[0].resources.wood).toBe(1);
    expect(harvest.players[0].beggingCards).toBe(4);
  });

  it("applies selected workshop harvest conversions before feeding", () => {
    const { engine, state } = startTwoPlayerGame();
    let harvest = engine.advancePhase({
      ...state,
      round: 7,
      phase: "HARVEST" as const,
      players: state.players.map((player, index) => ({
        ...player,
        resources: index === 0 ? { ...player.resources, food: 0, wood: 1 } : { ...player.resources, food: 4 },
        majorImprovements: index === 0 ? ["joinery"] : player.majorImprovements,
      })),
    });

    harvest = confirmFieldHarvest(engine, harvest);
    harvest = engine.submitHarvestFeeding(harvest, "p1", {
      grainToFood: 0,
      vegetableToFood: 0,
      harvestConversions: [{ improvementId: "joinery", count: 1 }],
    });

    expect(harvest.players[0].resources.wood).toBe(0);
    expect(harvest.players[0].resources.food).toBe(2);
    expect(harvest.harvestFeeding?.submittedPlayerIds).toEqual(["p1"]);
  });

  it("applies selected occupation and minor-improvement harvest conversions", () => {
    const { engine, state } = startTwoPlayerGame();
    let harvest = engine.advancePhase({
      ...state,
      round: 7,
      phase: "HARVEST" as const,
      players: state.players.map((player, index) => ({
        ...player,
        resources: index === 0 ? { ...player.resources, food: 0, clay: 4, reed: 1 } : { ...player.resources, food: 4 },
        minorImprovements: index === 0 ? ["hard-porcelain"] : player.minorImprovements,
        occupations: index === 0 ? ["putcher-maker"] : player.occupations,
        cardStates: index === 0
          ? {
              "hard-porcelain": {
                cardId: "hard-porcelain",
                playedRound: 1,
                markers: {},
                storedAnimals: {},
                storedGoods: {},
                bonusPoints: 0,
              },
              "putcher-maker": {
                cardId: "putcher-maker",
                playedRound: 1,
                markers: {},
                storedAnimals: {},
                storedGoods: {},
                bonusPoints: 0,
              },
            }
          : player.cardStates,
      })),
    });

    harvest = confirmFieldHarvest(engine, harvest);
    harvest = engine.submitHarvestFeeding(harvest, "p1", {
      grainToFood: 0,
      vegetableToFood: 0,
      harvestConversions: [
        { improvementId: "hard-porcelain", conversionId: "clay-4-stone-3", count: 1 },
        { improvementId: "putcher-maker", count: 1 },
      ],
    });

    expect(harvest.players[0].resources.clay).toBe(0);
    expect(harvest.players[0].resources.reed).toBe(0);
    expect(harvest.players[0].resources.stone).toBe(3);
    expect(harvest.players[0].resources.food).toBe(2);
    expect(harvest.lastError).toBeNull();
  });

  it("uses the selected conversion option for multi-path occupation cards", () => {
    const { engine, state } = startTwoPlayerGame();
    let harvest = engine.advancePhase({
      ...state,
      round: 7,
      phase: "HARVEST" as const,
      players: state.players.map((player, index) => ({
        ...player,
        resources: index === 0 ? { ...player.resources, food: 3 } : { ...player.resources, food: 4 },
        animals: index === 0 ? { ...player.animals, sheep: 1 } : player.animals,
        farm: index === 0
          ? {
              ...player.farm,
              animalHousing: {
                ...player.farm.animalHousing,
                house: { animal: "sheep" as const, count: 1 },
              },
            }
          : player.farm,
        occupations: index === 0 ? ["sheep-walker"] : player.occupations,
        cardStates: index === 0
          ? {
              "sheep-walker": {
                cardId: "sheep-walker",
                playedRound: 1,
                markers: {},
                storedAnimals: {},
                storedGoods: {},
                bonusPoints: 0,
              },
            }
          : player.cardStates,
      })),
    });

    harvest = confirmFieldHarvest(engine, harvest);
    harvest = engine.submitHarvestFeeding(harvest, "p1", {
      grainToFood: 0,
      vegetableToFood: 0,
      harvestConversions: [{ improvementId: "sheep-walker", conversionId: "sheep-to-stone", count: 1 }],
    });

    expect(harvest.players[0].animals.sheep).toBe(0);
    expect(harvest.players[0].animals.boar).toBe(0);
    expect(harvest.players[0].resources.vegetable).toBe(0);
    expect(harvest.players[0].resources.stone).toBe(1);
    expect(harvest.lastError).toBeNull();
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

  it("gives one stone and one food from the two player resource market", () => {
    const { engine, state } = startTwoPlayerGame();
    const player = state.players[0];

    const nextState = engine.placeWorker(state, player.id, player.workers[0].id, "two-player-flex", {
      selectedEffectTypes: ["buildingSupplies"],
      selectedEffectIds: ["resource-market"],
    });

    expect(nextState.players[0].resources.stone).toBe(1);
    expect(nextState.players[0].resources.wood).toBe(0);
    expect(nextState.players[0].resources.reed).toBe(0);
    expect(nextState.players[0].resources.food).toBe(player.resources.food + 1);
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

  it("rejects final redevelopment fences without first renovating", () => {
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
                { type: "buildFences" as const, id: "final-fences", requiresSelectedEffectTypes: ["renovate"] },
              ],
            },
          ],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, wood: 4 },
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "farm-redevelopment-test", {
      selectedEffectTypes: ["buildFences"],
      selectedEffectIds: ["final-fences"],
      fenceSegments: [
        { orientation: "horizontal", row: 0, col: 1 },
        { orientation: "vertical", row: 0, col: 1 },
        { orientation: "vertical", row: 0, col: 2 },
        { orientation: "horizontal", row: 1, col: 1 },
      ],
    });

    expect(nextState.lastError).toBe("必须先翻修房屋后才能执行后续行动。");
    expect(nextState.players[0].farm.fencesUsed).toBe(0);
  });

  it("renovates before buying a major improvement from house redevelopment", () => {
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
          effects: [
            {
              type: "chooseAny" as const,
              effects: [
                { type: "renovate" as const, id: "redevelop-renovate", allowMajorImprovement: false },
                { type: "buyMajorImprovement" as const, id: "redevelop-major", requiresSelectedEffectTypes: ["renovate"] },
              ],
            },
          ],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, clay: 4, reed: 1 },
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "house-redevelopment-test", {
      selectedEffectTypes: ["renovate", "buyMajorImprovement"],
      selectedEffectIds: ["redevelop-renovate", "redevelop-major"],
      majorImprovementId: "fireplace-a",
    });

    expect(nextState.players[0].farm.roomMaterial).toBe("clay");
    expect(nextState.players[0].majorImprovements).toContain("fireplace-a");
    expect(nextState.players[0].resources.clay).toBe(0);
    expect(nextState.players[0].resources.reed).toBe(0);
    expect(nextState.lastError).toBeNull();
  });

  it("rejects buying a redevelopment major improvement without renovation", () => {
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
          effects: [
            {
              type: "chooseAny" as const,
              effects: [
                { type: "renovate" as const, id: "redevelop-renovate", allowMajorImprovement: false },
                { type: "buyMajorImprovement" as const, id: "redevelop-major", requiresSelectedEffectTypes: ["renovate"] },
              ],
            },
          ],
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

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "house-redevelopment-test", {
      selectedEffectTypes: ["buyMajorImprovement"],
      selectedEffectIds: ["redevelop-major"],
      majorImprovementId: "fireplace-a",
    });

    expect(nextState.lastError).toBe("必须先翻修房屋后才能执行后续行动。");
    expect(nextState.players[0].majorImprovements).not.toContain("fireplace-a");
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

  it("uses card-triggered bake bread effects with the selected major improvement", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "farmland-bake-card-test",
          name: "农田",
          type: "instant" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "plowField" as const, id: "plow-only" }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              majorImprovements: ["stone-oven"],
              minorImprovements: ["threshing-board"],
              resources: { ...candidate.resources, grain: 2, food: 0 },
              cardStates: {
                ...candidate.cardStates,
                "threshing-board": {
                  cardId: "threshing-board",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
            }
          : candidate,
      ),
    };

    const nextState = engine.placeWorker(prepared, "p1", prepared.players[0].workers[0].id, "farmland-bake-card-test", {
      selectedEffectTypes: ["plowField"],
      selectedEffectIds: ["plow-only"],
      fieldCell: { row: 0, col: 2 },
      bake: { improvementId: "stone-oven", grain: 2 },
    });

    expect(nextState.players[0].resources.grain).toBe(0);
    expect(nextState.players[0].resources.food).toBe(8);
    expect(nextState.players[0].farm.cells.find((cell) => cell.row === 0 && cell.col === 2)?.field).toEqual({ crop: null, count: 0 });
    expect(nextState.lastError).toBeNull();
  });

  it("triggers dutch windmill only when bake bread actually runs", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "sow-bake-card-test",
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
              minorImprovements: ["dutch-windmill"],
              resources: { ...candidate.resources, grain: 1, food: 0 },
              cardStates: {
                ...candidate.cardStates,
                "dutch-windmill": {
                  cardId: "dutch-windmill",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
            }
          : candidate,
      ),
    };

    const baked = engine.placeWorker(prepared, "p1", prepared.players[0].workers[0].id, "sow-bake-card-test", {
      selectedEffectTypes: ["bakeBread"],
      selectedEffectIds: ["bake-only"],
      bake: { improvementId: "clay-oven", grain: 1 },
    });

    expect(baked.players[0].resources.food).toBe(8);

    const noBakePrepared = {
      ...prepared,
      actionSpaces: prepared.actionSpaces.map((space) => (space.id === "sow-bake-card-test" ? { ...space, occupiedBy: null } : space)),
      players: prepared.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, grain: 0, food: 0 },
              workers: candidate.workers.map((worker) => ({ ...worker, location: "home" as const, actionSpaceId: null })),
              farm: {
                ...candidate.farm,
                cells: candidate.farm.cells.map((cell) => (cell.row === 0 && cell.col === 2 ? { ...cell, field: { crop: null, count: 0 } } : cell)),
              },
            }
          : candidate,
      ),
    };
    const onlySowed = engine.placeWorker(noBakePrepared, "p1", noBakePrepared.players[0].workers[0].id, "sow-bake-card-test", {
      selectedEffectTypes: ["sow"],
      selectedEffectIds: ["sow-only"],
      sow: [],
    });

    expect(onlySowed.players[0].resources.food).toBe(0);
    expect(onlySowed.lastError).toBeNull();
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
    expect(nextState.actionSpaces.find((space) => space.id === "western-quarry-test")?.accumulated).toEqual({ stone: 0 });
    expect(nextState.lastError).toBeNull();
  });

  it("takes the two-player copse accumulated wood without animal placement", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: state.actionSpaces.map((space) => (space.id === "two-player-flex" ? { ...space, accumulated: { wood: 2 } } : space)),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "two-player-flex", {
      selectedEffectTypes: ["takeAccumulated"],
      selectedEffectIds: ["copse"],
    });

    expect(nextState.players[0].resources.wood).toBe(2);
    expect(nextState.actionSpaces.find((space) => space.id === "two-player-flex")?.accumulated).toEqual({ wood: 0 });
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

  it("resolves the meeting place starting player action when the occupation placeholder is unavailable", () => {
    const { engine, state } = startTwoPlayerGame();
    const player = state.players[0];

    const nextState = engine.placeWorker(state, player.id, player.workers[0].id, "meeting-place", {
      selectedEffectTypes: ["takeStartingPlayer"],
      selectedEffectIds: ["takeStartingPlayer:0"],
    });

    expect(nextState.startingPlayer).toBe(player.id);
    expect(nextState.players[0].resources.grain).toBe(0);
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

  it("plows then sows a newly plowed field from the same choose-any action", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "plow-sow-test",
          name: "耕田与播种",
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
                { id: "plow-test", type: "plowField" as const },
                { id: "sow-test", type: "sow" as const },
              ],
            },
          ],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, grain: 1 },
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "plow-sow-test", {
      selectedEffectTypes: ["plowField", "sow"],
      selectedEffectIds: ["plow-test", "sow-test"],
      fieldCell: { row: 0, col: 0 },
      sow: [{ crop: "grain", cells: [{ row: 0, col: 0 }] }],
    });

    const cell = nextState.players[0].farm.cells.find((candidate) => candidate.row === 0 && candidate.col === 0);
    expect(cell?.field).toEqual({ crop: "grain", count: 3 });
    expect(nextState.players[0].resources.grain).toBe(0);
    expect(nextState.lastError).toBeNull();
  });

  it("sows grain and vegetables from separate sow inputs in one action", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "sow-both-test",
          name: "播种",
          type: "choice" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ id: "sow-test", type: "sow" as const }],
        },
      ],
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, grain: 1, vegetable: 1 },
              farm: {
                ...candidate.farm,
                cells: candidate.farm.cells.map((cell) =>
                  (cell.row === 0 && cell.col === 0) || (cell.row === 0 && cell.col === 1) ? { ...cell, field: { crop: null, count: 0 } } : cell,
                ),
              },
            }
          : candidate,
      ),
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "sow-both-test", {
      selectedEffectTypes: ["sow"],
      selectedEffectIds: ["sow-test"],
      sow: [
        { crop: "grain", cells: [{ row: 0, col: 0 }] },
        { crop: "vegetable", cells: [{ row: 0, col: 1 }] },
      ],
    });

    const grainCell = nextState.players[0].farm.cells.find((candidate) => candidate.row === 0 && candidate.col === 0);
    const vegetableCell = nextState.players[0].farm.cells.find((candidate) => candidate.row === 0 && candidate.col === 1);
    expect(grainCell?.field).toEqual({ crop: "grain", count: 3 });
    expect(vegetableCell?.field).toEqual({ crop: "vegetable", count: 2 });
    expect(nextState.players[0].resources.grain).toBe(0);
    expect(nextState.players[0].resources.vegetable).toBe(0);
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

  it("lets adoptive parents make the newborn act immediately", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "adoptive-family-growth-test",
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
              resources: { ...candidate.resources, food: 1 },
              occupations: ["adoptive-parents"],
              farm: {
                ...candidate.farm,
                cells: candidate.farm.cells.map((cell) => (cell.row === 0 && cell.col === 0 ? { ...cell, room: true, roomMaterial: "wood" as const } : cell)),
              },
              cardStates: {
                "adoptive-parents": {
                  cardId: "adoptive-parents",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
            }
          : candidate,
      ),
    };

    const nextState = engine.placeWorker(prepared, "p1", prepared.players[0].workers[0].id, "adoptive-family-growth-test", {
      selectedEffectTypes: ["familyGrowth"],
      selectedEffectIds: ["family-growth"],
    });

    expect(nextState.players[0].workers).toHaveLength(3);
    expect(nextState.players[0].workers[2].availableRound).toBe(state.round);
    expect(nextState.players[0].resources.food).toBe(0);
    expect(nextState.currentPlayer).toBe("p1");
    expect(nextState.lastError).toBeNull();
  });

  it("creates private and public card action spaces with owner rules", () => {
    const { engine, state } = startFivePlayerGame();
    const withPrivateSpace = {
      ...state,
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              occupationHand: ["greenhouse-builder"],
            }
          : candidate,
      ),
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "play-greenhouse-builder",
          name: "打出职业",
          type: "instant" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "playOccupation" as const }],
        },
      ],
    };

    const playedPrivate = engine.placeWorker(withPrivateSpace, "p1", withPrivateSpace.players[0].workers[0].id, "play-greenhouse-builder", {
      selectedEffectTypes: ["playOccupation"],
      occupationCardId: "greenhouse-builder",
    });
    const privateSpace = playedPrivate.actionSpaces.find((space) => space.id === "private-greenhouse-builder");
    const rejectedOtherPlayer = engine.placeWorker(
      {
        ...playedPrivate,
        currentPlayer: "p2",
        currentPlayerIndex: 1,
      },
      "p2",
      playedPrivate.players[1].workers[0].id,
      "private-greenhouse-builder",
    );

    expect(privateSpace?.ownerId).toBe("p1");
    expect(privateSpace?.visibility).toBe("private");
    expect(rejectedOtherPlayer.lastError).toBe("这是其他玩家的私人行动格。");

    const withPublicSpace = {
      ...state,
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              occupationHand: ["fold-builder"],
            }
          : {
            ...candidate,
            resources: { ...candidate.resources, food: 1, wood: 4 },
            majorImprovements: ["fireplace-a"],
          },
      ),
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "play-fold-builder",
          name: "打出职业",
          type: "instant" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ type: "playOccupation" as const }],
        },
      ],
    };
    const playedPublic = engine.placeWorker(withPublicSpace, "p1", withPublicSpace.players[0].workers[0].id, "play-fold-builder", {
      selectedEffectTypes: ["playOccupation"],
      occupationCardId: "fold-builder",
    });
    const usedPublic = engine.placeWorker(
      {
        ...playedPublic,
        currentPlayer: "p2",
        currentPlayerIndex: 1,
      },
      "p2",
      playedPublic.players[1].workers[0].id,
      "fold-builder-action",
      {
        selectedEffectTypes: ["buildFences", "gainAnimal"],
        selectedEffectIds: ["buildFences:0", "gainAnimal:sheep:1"],
        fenceSegments: [
          { orientation: "horizontal", row: 0, col: 1 },
          { orientation: "horizontal", row: 1, col: 1 },
          { orientation: "vertical", row: 0, col: 1 },
          { orientation: "vertical", row: 0, col: 2 },
        ],
        animalChoice: "sheep",
        animalPlacement: {
          animal: "sheep",
          placements: [{ type: "pasture", pastureId: "pasture-1", row: 0, col: 1, count: 1, animal: "sheep" }],
        },
      },
    );

    expect(playedPublic.actionSpaces.find((space) => space.id === "fold-builder-action")?.visibility).toBe("public");
    expect(usedPublic.players[0].resources.food).toBe(3);
    expect(usedPublic.players[1].resources.food).toBe(0);
    expect(usedPublic.players[1].farm.pastures).toHaveLength(1);
    expect(usedPublic.players[1].animals.sheep).toBe(1);
    expect(usedPublic.players[1].farm.pastures[0]).toMatchObject({ animalType: "sheep", animalCount: 1 });
    expect(usedPublic.lastError).toBeNull();
  });

  it("requires explicit pending action access for sidekick-style extra actions", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              occupations: ["sidekick"],
              cardStates: {
                sidekick: {
                  cardId: "sidekick",
                  playedRound: 1,
                  markers: {},
                  storedAnimals: {},
                  storedGoods: {},
                  bonusPoints: 0,
                },
              },
            }
          : candidate,
      ),
    };

    const firstAction = engine.placeWorker(prepared, "p1", prepared.players[0].workers[0].id, "forest");
    const rejectedWithoutFlag = engine.placeWorker(firstAction, "p1", prepared.players[0].workers[1].id, "clay-pit");
    const secondAction = engine.placeWorker(firstAction, "p1", prepared.players[0].workers[1].id, "clay-pit", {
      usePendingActionAccess: true,
    });

    expect(firstAction.currentPlayer).toBe("p1");
    expect(firstAction.pendingActionAccess?.playerId).toBe("p1");
    expect(rejectedWithoutFlag.lastError).toBe("请先使用或放弃卡牌提供的连续行动。");
    expect(secondAction.pendingActionAccess).toBeNull();
    expect(secondAction.players[0].resources.clay).toBe(1);
    expect(secondAction.lastError).toBeNull();
  });

  it("requires family growth before a family-growth minor improvement placeholder", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "family-growth-room-test",
          name: "生孩子（需要空房）",
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
                { id: "family-growth", type: "familyGrowth" as const, requiresRoom: true },
                { id: "family-growth-minor", type: "playMinorImprovementPlaceholder" as const, requiresSelectedEffectTypes: ["familyGrowth"] },
              ],
            },
          ],
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
      selectedEffectTypes: ["playMinorImprovementPlaceholder"],
      selectedEffectIds: ["family-growth-minor"],
    });

    expect(nextState.lastError).toBe("必须先生孩子后才能打出小设施。");
    expect(nextState.players[0].workers).toHaveLength(2);
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

  it("cooks vegetables through a purchased fireplace", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              resources: { ...candidate.resources, vegetable: 1 },
              majorImprovements: ["fireplace-a"],
            }
          : candidate,
      ),
      majorImprovements: state.majorImprovements.map((card) => (card.id === "fireplace-a" ? { ...card, purchasedBy: "p1" } : card)),
    };

    const cooked = engine.cookWithMajorImprovement(prepared, "p1", "fireplace-a", [], [{ from: "vegetable", count: 1 }]);

    expect(cooked.players[0].resources.vegetable).toBe(0);
    expect(cooked.players[0].resources.food).toBe(prepared.players[0].resources.food + 2);
    expect(cooked.lastError).toBeNull();
  });

  it("uses the selected cooking improvement value when cooking newly gained animals", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              majorImprovements: ["fireplace-a", "cooking-hearth-a"],
              resources: { ...candidate.resources, food: 0 },
            }
          : candidate,
      ),
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "boar-market-test",
          name: "野猪市场",
          type: "accumulation" as const,
          cost: {},
          gain: { boar: 1 },
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: { boar: 1 },
          effects: [{ type: "takeAccumulated" as const }],
        },
      ],
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "boar-market-test", {
      selectedEffectTypes: ["takeAccumulated"],
      selectedEffectIds: ["takeAccumulated:0"],
      animalPlacement: {
        animal: "boar",
        placements: [],
        cooked: 1,
        cookImprovementId: "cooking-hearth-a",
      },
    });

    expect(nextState.players[0].resources.food).toBe(3);
    expect(nextState.lastError).toBeNull();
  });

  it("pays only the clay difference when upgrading a fireplace to a cooking hearth", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      players: state.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              majorImprovements: ["fireplace-b"],
              resources: { ...candidate.resources, clay: 1 },
            }
          : candidate,
      ),
      majorImprovements: state.majorImprovements.map((card) => (card.id === "fireplace-b" ? { ...card, purchasedBy: "p1" } : card)),
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "buy-hearth-test",
          name: "购买大设施",
          type: "choice" as const,
          cost: {},
          gain: {},
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: {},
          effects: [{ id: "buy-major", type: "buyMajorImprovement" as const }],
        },
      ],
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "buy-hearth-test", {
      selectedEffectTypes: ["buyMajorImprovement"],
      selectedEffectIds: ["buy-major"],
      majorImprovementId: "cooking-hearth-a",
      upgradeFromId: "fireplace-b",
    });

    expect(nextState.players[0].resources.clay).toBe(0);
    expect(nextState.players[0].majorImprovements).toContain("cooking-hearth-a");
    expect(nextState.players[0].majorImprovements).not.toContain("fireplace-b");
    expect(nextState.majorImprovements.find((card) => card.id === "fireplace-b")?.purchasedBy).toBeNull();
    expect(nextState.lastError).toBeNull();
  });

  it("removes players only while a room is waiting", () => {
    const engine = new GameEngine();
    let waiting = engine.createWaitingGame("test");
    waiting = engine.addPlayer(waiting, { id: "p1", name: "A" });
    waiting = engine.addPlayer(waiting, { id: "p2", name: "B" });

    const removed = engine.removePlayer(waiting, "p1");
    expect(removed.players.map((player) => player.id)).toEqual(["p2"]);

    const started = engine.startGame(readyAll(engine, waiting));
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

  it("applies fixed per-room build costs from occupation cards", () => {
    const farmManager = new FarmManager();
    const { state } = startTwoPlayerGame();
    const player = {
      ...state.players[0],
      resources: {
        ...state.players[0].resources,
        wood: 6,
        reed: 4,
      },
      occupations: ["carpenter"],
      cardStates: {
        carpenter: {
          cardId: "carpenter",
          playedRound: 1,
          markers: {},
          storedAnimals: {},
          storedGoods: {},
          bonusPoints: 0,
        },
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

  it("keeps fixed wooden-room minor cost scoped to wooden rooms", () => {
    const farmManager = new FarmManager();
    const { state } = startTwoPlayerGame();
    const player = {
      ...state.players[0],
      resources: {
        ...state.players[0].resources,
        clay: 10,
        reed: 4,
      },
      minorImprovements: ["carpenters-parlor"],
      cardStates: {
        "carpenters-parlor": {
          cardId: "carpenters-parlor",
          playedRound: 1,
          markers: {},
          storedAnimals: {},
          storedGoods: {},
          bonusPoints: 0,
        },
      },
      farm: {
        ...state.players[0].farm,
        roomMaterial: "clay" as const,
        cells: state.players[0].farm.cells.map((cell) => (cell.room ? { ...cell, roomMaterial: "clay" as const } : cell)),
      },
    };

    const updated = farmManager.buildRooms(player, [
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ]);

    expect(updated.farm.cells.filter((cell) => cell.room)).toHaveLength(4);
    expect(updated.resources.clay).toBe(0);
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

  it("does not allow fences between rooms, fields, or their farm boundary", () => {
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

  it("allows fences between a room or field and an empty cell", () => {
    const farmManager = new FarmManager();
    const { state } = startTwoPlayerGame();
    const player = {
      ...state.players[0],
      resources: {
        ...state.players[0].resources,
        wood: 5,
      },
      farm: {
        ...state.players[0].farm,
        cells: state.players[0].farm.cells.map((cell) => (cell.row === 0 && cell.col === 2 ? { ...cell, field: { crop: null, count: 0 } } : cell)),
      },
    };

    const fenced = farmManager.buildFencesByEdges(player, [
      { row: 0, col: 1, edge: "top" },
      { row: 0, col: 1, edge: "right" },
      { row: 0, col: 1, edge: "bottom" },
      { row: 0, col: 1, edge: "left" },
    ]);

    expect(fenced.farm.pastures).toHaveLength(1);
    expect(fenced.resources.wood).toBe(1);
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

  it("keeps stable animals when the stable is fenced into a pasture", () => {
    const farmManager = new FarmManager();
    const { state } = startTwoPlayerGame();
    let player = {
      ...state.players[0],
      resources: {
        ...state.players[0].resources,
        wood: 5,
      },
    };

    player = farmManager.buildStables(player, [{ row: 0, col: 1 }], 1, 1);
    player = farmManager.placeAnimals(player, "sheep", 1, [{ type: "stable", row: 0, col: 1, count: 1 }]);
    const fenced = farmManager.buildFencesByEdges(player, [
      { row: 0, col: 1, edge: "top" },
      { row: 0, col: 1, edge: "right" },
      { row: 0, col: 1, edge: "bottom" },
      { row: 0, col: 1, edge: "left" },
    ]);

    expect(fenced.animals.sheep).toBe(1);
    expect(fenced.farm.pastures[0].animalType).toBe("sheep");
    expect(fenced.farm.pastures[0].animalCount).toBe(1);
    expect(fenced.farm.animalHousing.stables[0]).toMatchObject({ row: 0, col: 1, animal: null, count: 0 });
    expect(fenced.farm.animalHousing.cells).toContainEqual({ row: 0, col: 1, animal: "sheep", count: 1 });
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

  it("limits animal placement by individual pasture cell capacity", () => {
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

    expect(() => farmManager.placeAnimals(fenced, "sheep", 4, [{ type: "pasture", pastureId: fenced.farm.pastures[0].id, row: 0, col: 2, count: 4 }])).toThrow();
  });

  it("does not keep an animal type on an empty pasture after splitting a pasture", () => {
    const farmManager = new FarmManager();
    const { state } = startTwoPlayerGame();
    let player = {
      ...state.players[0],
      resources: {
        ...state.players[0].resources,
        wood: 7,
      },
    };
    player = farmManager.buildFencesByEdges(player, [
      { row: 0, col: 2, edge: "top" },
      { row: 0, col: 2, edge: "left" },
      { row: 0, col: 2, edge: "right" },
      { row: 1, col: 2, edge: "left" },
      { row: 1, col: 2, edge: "right" },
      { row: 1, col: 2, edge: "bottom" },
    ]);
    player = farmManager.placeAnimals(player, "sheep", 2, [{ type: "pasture", pastureId: player.farm.pastures[0].id, row: 0, col: 2, count: 2 }]);

    const split = farmManager.buildFencesByEdges(player, [{ row: 0, col: 2, edge: "bottom" }]);
    const emptyPasture = split.farm.pastures.find((pasture) => pasture.animalCount === 0);

    expect(split.farm.pastures).toHaveLength(2);
    expect(emptyPasture?.animalType).toBeNull();
  });

  it("uses animalChoice to resolve one animal from a multi-animal action", () => {
    const engine = new GameEngine();
    let state = engine.createWaitingGame("test");
    state = engine.addPlayer(state, { id: "p1", name: "A" });
    state = engine.addPlayer(state, { id: "p2", name: "B" });
    state = engine.addPlayer(state, { id: "p3", name: "C" });
    state = engine.startGame(readyAll(engine, state));

    const player = state.players[0];
    const updated = engine.placeWorker(state, player.id, player.workers[0].id, "three-four-flex", {
      selectedEffectTypes: ["gainAnimal"],
      animalChoice: "boar",
      animalPlacement: {
        animal: "boar",
        placements: [{ type: "house", count: 1 }],
      },
    });

    expect(updated.players[0].animals.sheep).toBe(0);
    expect(updated.players[0].animals.boar).toBe(1);
    expect(updated.players[0].animals.cattle).toBe(0);
  });

  it("requires accumulated animals to be fully handled by the player", () => {
    const { engine, state } = startTwoPlayerGame();
    const prepared = {
      ...state,
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "sheep-market-test",
          name: "羊市场",
          type: "accumulation" as const,
          cost: {},
          gain: { sheep: 1 },
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: { sheep: 3 },
          effects: [{ type: "takeAccumulated" as const }],
        },
      ],
    };
    const player = prepared.players[0];

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "sheep-market-test", {
      selectedEffectTypes: ["takeAccumulated"],
      selectedEffectIds: ["takeAccumulated:0"],
    });

    expect(nextState.lastError).toBe("必须选择动物安置、烹饪或丢弃方式。");
    expect(nextState.players[0].animals.sheep).toBe(0);
  });

  it("handles accumulated animals across pasture, house, cooking, and discard choices", () => {
    const { engine, state } = startTwoPlayerGame();
    const farmManager = new FarmManager();
    let player = {
      ...state.players[0],
      resources: {
        ...state.players[0].resources,
        wood: 4,
        clay: 2,
        food: 0,
      },
      majorImprovements: ["fireplace-a"],
    };
    player = farmManager.buildFencesByEdges(player, [
      { row: 0, col: 1, edge: "top" },
      { row: 0, col: 1, edge: "right" },
      { row: 0, col: 1, edge: "bottom" },
      { row: 0, col: 1, edge: "left" },
    ]);
    const pastureId = player.farm.pastures[0].id;
    const prepared = {
      ...state,
      players: [player, state.players[1]],
      actionSpaces: [
        ...state.actionSpaces,
        {
          id: "sheep-market-test",
          name: "羊市场",
          type: "accumulation" as const,
          cost: {},
          gain: { sheep: 1 },
          prerequisites: [],
          rules: [],
          restrictions: [],
          occupiedBy: null,
          accumulated: { sheep: 7 },
          effects: [{ type: "takeAccumulated" as const }],
        },
      ],
    };

    const nextState = engine.placeWorker(prepared, player.id, player.workers[0].id, "sheep-market-test", {
      selectedEffectTypes: ["takeAccumulated"],
      selectedEffectIds: ["takeAccumulated:0"],
      animalPlacement: {
        animal: "sheep",
        placements: [
          { type: "pasture", pastureId, row: 0, col: 1, count: 2 },
          { type: "house", count: 1 },
        ],
        cooked: 2,
        discarded: 2,
      },
    });

    expect(nextState.lastError).toBeNull();
    expect(nextState.players[0].animals.sheep).toBe(3);
    expect(nextState.players[0].resources.food).toBe(4);
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


