import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { GameEngine } from "../../engine/GameEngine";
import { SocketEvents } from "../../shared/socketEvents";
import type {
  AdminAdjustResourcePayload,
  AdminRoomPayload,
  AuthPayload,
  CardActionPayload,
  CookWithMajorImprovementPayload,
  CreateRoomPayload,
  JoinRoomPayload,
  LeaveRoomPayload,
  PlaceWorkerPayload,
  RestoreSessionPayload,
  RoomSnapshot,
  StartGamePayload,
  SubmitHarvestFieldPayload,
  SubmitHarvestFeedingPayload,
  SubmitHarvestBreedingPayload,
} from "../../shared/types";
import type { GameState } from "../../state/GameState";
import type { AnimalState, ResourceState } from "../../state/PlayerState";
import { FarmManager } from "../../engine/FarmManager";
import { createAuthToken, resolveAuthToken } from "../db/authTokens";
import { deleteRoomSnapshot, ensureUser, loadStoredRoomSnapshots, loginUser, registerUser, saveRoomSnapshot } from "../db/sqlite";
import { findRecoverableUserRoom } from "./roomRecovery";

export interface RoomRecord {
  roomId: string;
  game: GameState;
  updatedAt: string;
}

const rooms = new Map<string, RoomRecord>();
const engine = new GameEngine();
const farmManager = new FarmManager();
const socketUsers = new Map<string, string>();
const departedRoomPlayers = new Map<string, Set<string>>();
const autoAdvancePhases: ReadonlySet<GameState["phase"]> = new Set(["RETURN_HOME", "HARVEST", "NEXT_ROUND", "ROUND_PREPARE"]);
const scheduledAutoAdvances = new Map<string, Array<ReturnType<typeof setTimeout>>>();
const adminUsername = "admin";
const adminDefaultPassword = "admin";
const adminTestRoomId = "admin-test";
const adminTestResources: ResourceState = {
  wood: 20,
  clay: 20,
  reed: 20,
  stone: 20,
  grain: 10,
  vegetable: 10,
  food: 20,
};

export function attachSocketServer(httpServer: HttpServer): Server {
  ensureUser(adminUsername, adminDefaultPassword);
  loadStoredRoomSnapshots().forEach(({ snapshot, updatedAt }) => {
    if (snapshot.game.phase === "WAITING" || snapshot.game.players.length === 0) {
      deleteRoomSnapshot(snapshot.roomId);
      return;
    }

    rooms.set(snapshot.roomId, {
      roomId: snapshot.roomId,
      game: migrateGameState(snapshot.game),
      updatedAt,
    });
  });
  ensureAdminTestRoom();

  const io = new Server(httpServer, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    emitRoomList(socket);

    socket.on(SocketEvents.REGISTER, (payload: AuthPayload) => {
      const result = registerUser(payload.username, payload.password);
      if (!result.ok) {
        socket.emit(SocketEvents.AUTH_ERROR, { message: result.message });
        return;
      }

      const username = payload.username.trim();
      const token = createAuthToken(username);
      socketUsers.set(socket.id, username);
      socket.emit(SocketEvents.AUTH_SUCCESS, { username, token });
      emitRoomList(socket);
    });

    socket.on(SocketEvents.LOGIN, (payload: AuthPayload) => {
      const result = loginUser(payload.username, payload.password);
      if (!result.ok) {
        socket.emit(SocketEvents.AUTH_ERROR, { message: result.message });
        return;
      }

      const username = payload.username.trim();
      const token = createAuthToken(username);
      socketUsers.set(socket.id, username);
      socket.emit(SocketEvents.AUTH_SUCCESS, { username, token });
      emitRoomList(socket);
      syncUserRoom(io, socket, username);
    });

    socket.on(SocketEvents.RESTORE_SESSION, (payload: RestoreSessionPayload) => {
      const username = resolveAuthToken(payload.token);
      if (!username) {
        socket.emit(SocketEvents.AUTH_ERROR, { message: "登录已失效，请重新登录。" });
        return;
      }

      socketUsers.set(socket.id, username);
      socket.emit(SocketEvents.AUTH_SUCCESS, { username, token: payload.token });
      emitRoomList(socket);
      syncUserRoom(io, socket, username);
    });

    socket.on(SocketEvents.CREATE_ROOM, (payload: CreateRoomPayload) => {
      const username = getSocketUsername(socket, payload.playerName);
      leaveWaitingRoomsForUser(io, socket, username);

      const roomId = createNumericRoomId();
      const game = engine.addPlayer(engine.createWaitingGame(roomId), {
        id: username,
        name: username,
      });
      const room: RoomRecord = { roomId, game, updatedAt: new Date().toISOString() };

      rooms.set(roomId, room);
      socket.join(roomId);
      syncRoom(io, room);
      broadcastRoomLists(io);
    });

    socket.on(SocketEvents.JOIN_ROOM, (payload: JoinRoomPayload) => {
      const room = rooms.get(payload.roomId);
      const username = getSocketUsername(socket, payload.playerName);

      if (!room) {
        socket.emit(SocketEvents.ACTION_NOTICE, {
          message: "房间不存在。",
        });
        return;
      }

      if (isAdminTestRoom(room)) {
        if (username !== adminUsername) {
          socket.emit(SocketEvents.ACTION_NOTICE, {
            message: "这个测试房间只有管理员可进入。",
          });
          return;
        }
        socket.join(payload.roomId);
        socket.emit(SocketEvents.SYNC_STATE, {
          roomId: room.roomId,
          game: room.game,
        } satisfies RoomSnapshot);
        return;
      }

      const existingPlayer = room.game.players.some((player) => player.id === username);
      if (room.game.phase !== "WAITING") {
        if (hasDepartedRoom(payload.roomId, username)) {
          socket.emit(SocketEvents.ACTION_NOTICE, {
            message: "你已经退出该房间，游戏进行中不能重新加入。",
          });
          return;
        }

        if (existingPlayer) {
          socket.join(payload.roomId);
          socket.emit(SocketEvents.SYNC_STATE, {
            roomId: room.roomId,
            game: room.game,
          } satisfies RoomSnapshot);
          return;
        }

        socket.emit(SocketEvents.ACTION_NOTICE, {
          message: "游戏已经开始，不能中途加入房间。",
        });
        return;
      }

      leaveWaitingRoomsForUser(io, socket, username, payload.roomId);
      room.game = engine.addPlayer(room.game, {
        id: username,
        name: username,
      });

      socket.join(payload.roomId);
      syncRoom(io, room);
      broadcastRoomLists(io);
    });

    socket.on(SocketEvents.LEAVE_ROOM, (payload: LeaveRoomPayload) => {
      const username = socketUsers.get(socket.id);
      const room = rooms.get(payload.roomId);

      if (!username || !room) {
        socket.emit(SocketEvents.ACTION_NOTICE, {
          message: "没有找到可退出的房间。",
        });
        return;
      }

      if (isAdminTestRoom(room)) {
        socket.leave(payload.roomId);
        socket.emit(SocketEvents.ROOM_LEFT, {
          roomId: payload.roomId,
          message: "已离开测试房间。",
        });
        emitRoomList(socket);
        return;
      }

      if (!room.game.players.some((player) => player.id === username)) {
        socket.leave(payload.roomId);
        socket.emit(SocketEvents.ROOM_LEFT, {
          roomId: payload.roomId,
          message: "已离开房间视图。",
        });
        return;
      }

      if (room.game.phase === "WAITING") {
        room.game = engine.removePlayer(room.game, username);
        socket.leave(payload.roomId);

        if (room.game.players.length === 0) {
          rooms.delete(payload.roomId);
          deleteRoomSnapshot(payload.roomId);
        } else {
          syncRoom(io, room);
        }

        socket.emit(SocketEvents.ROOM_LEFT, {
          roomId: payload.roomId,
          message: "已退出房间。",
        });
        broadcastRoomLists(io);
        return;
      }

      socket.leave(payload.roomId);
      markDepartedRoom(payload.roomId, username);
      socket.emit(SocketEvents.ROOM_LEFT, {
        roomId: payload.roomId,
        message: "已退出房间。游戏已经开始，不能中途重新加入。",
      });
      emitRoomList(socket);
    });

    socket.on(SocketEvents.START_GAME, (payload: StartGamePayload) => {
      const room = rooms.get(payload.roomId);
      if (!room) {
        return;
      }

      room.game = isAdminTestRoom(room) ? restartAdminTestGame() : engine.startGame(room.game);
      syncRoom(io, room);
      broadcastRoomLists(io);
    });

    socket.on(SocketEvents.PLACE_WORKER, (payload: PlaceWorkerPayload) => {
      const room = rooms.get(payload.roomId);
      if (!room) {
        return;
      }

      room.game = isAdminTestRoom(room)
        ? placeAdminTestWorker(room.game, payload.playerId, payload.actionSpaceId, payload.input)
        : engine.placeWorker(room.game, payload.playerId, payload.workerId, payload.actionSpaceId, payload.input);
      syncRoom(io, room);
      if (!isAdminTestRoom(room)) {
        scheduleAutoAdvanceNonInteractivePhases(io, room);
      }
      broadcastRoomLists(io);
    });

    socket.on(SocketEvents.PLAY_OCCUPATION, (payload: CardActionPayload) => {
      emitUnavailableCardNotice(io, socket, payload);
    });

    socket.on(SocketEvents.PLAY_IMPROVEMENT, (payload: CardActionPayload) => {
      emitUnavailableCardNotice(io, socket, payload);
    });

    socket.on(SocketEvents.BUILD_ROOMS, (payload: PlaceWorkerPayload) => {
      routePlaceWorker(io, payload);
    });

    socket.on(SocketEvents.BUILD_FENCES, (payload: PlaceWorkerPayload) => {
      routePlaceWorker(io, payload);
    });

    socket.on(SocketEvents.RENOVATE, (payload: PlaceWorkerPayload) => {
      routePlaceWorker(io, payload);
    });

    socket.on(SocketEvents.FAMILY_GROWTH, (payload: PlaceWorkerPayload) => {
      routePlaceWorker(io, payload);
    });

    socket.on(SocketEvents.SUBMIT_HARVEST_FIELD, (payload: SubmitHarvestFieldPayload) => {
      const room = rooms.get(payload.roomId);
      const username = socketUsers.get(socket.id);
      if (!room) {
        return;
      }
      if (username !== payload.playerId) {
        socket.emit(SocketEvents.ACTION_NOTICE, {
          message: "只能确认自己的田地收获。",
        });
        return;
      }

      room.game = engine.submitHarvestField(room.game, payload.playerId);
      syncRoom(io, room);
      broadcastRoomLists(io);
    });

    socket.on(SocketEvents.SUBMIT_HARVEST_FEEDING, (payload: SubmitHarvestFeedingPayload) => {
      const room = rooms.get(payload.roomId);
      const username = socketUsers.get(socket.id);
      if (!room) {
        return;
      }
      if (username !== payload.playerId) {
        socket.emit(SocketEvents.ACTION_NOTICE, {
          message: "只能确认自己的收获喂食。",
        });
        return;
      }

      const beforePhase = room.game.phase;
      const beforeRound = room.game.round;
      room.game = engine.submitHarvestFeeding(room.game, payload.playerId, {
        grainToFood: payload.grainToFood,
        vegetableToFood: payload.vegetableToFood,
        cookedAnimals: payload.cookedAnimals,
        cookedItems: payload.cookedItems,
        harvestConversions: payload.harvestConversions,
      });
      syncRoom(io, room);

      if (beforePhase === "HARVEST" && (room.game.phase !== "HARVEST" || room.game.round !== beforeRound)) {
        io.to(room.roomId).emit(SocketEvents.ACTION_NOTICE, {
          message: "喂养完成，动物繁殖，进入下一回合。",
        });
        scheduleAutoAdvanceNonInteractivePhases(io, room);
      }

      broadcastRoomLists(io);
    });

    socket.on(SocketEvents.SUBMIT_HARVEST_BREEDING, (payload: SubmitHarvestBreedingPayload) => {
      const room = rooms.get(payload.roomId);
      const username = socketUsers.get(socket.id);
      if (!room) {
        return;
      }
      if (username !== payload.playerId) {
        socket.emit(SocketEvents.ACTION_NOTICE, {
          message: "只能确认自己的繁殖处理。",
        });
        return;
      }

      room.game = engine.submitHarvestBreeding(room.game, payload.playerId, payload.resolution);
      syncRoom(io, room);
      scheduleAutoAdvanceNonInteractivePhases(io, room);
      broadcastRoomLists(io);
    });

    socket.on(SocketEvents.COOK_WITH_MAJOR_IMPROVEMENT, (payload: CookWithMajorImprovementPayload) => {
      const room = rooms.get(payload.roomId);
      const username = socketUsers.get(socket.id);
      if (!room) {
        return;
      }
      if (username !== payload.playerId) {
        socket.emit(SocketEvents.ACTION_NOTICE, {
          message: "只能操作自己的大设施。",
        });
        return;
      }

      room.game = engine.cookWithMajorImprovement(room.game, payload.playerId, payload.improvementId, payload.cookedAnimals, payload.cookedItems ?? []);
      syncRoom(io, room);
      broadcastRoomLists(io);
    });

    socket.on(SocketEvents.ADMIN_RESTART_TEST_ROOM, (payload: AdminRoomPayload) => {
      if (!assertAdminTestAction(socket, payload.roomId)) {
        return;
      }
      const room = rooms.get(adminTestRoomId);
      if (!room) return;

      room.game = restartAdminTestGame();
      socket.join(adminTestRoomId);
      syncRoom(io, room);
      broadcastRoomLists(io);
      socket.emit(SocketEvents.ACTION_NOTICE, {
        message: "测试房间已重开。",
      });
    });

    socket.on(SocketEvents.ADMIN_ADVANCE_ROUND, (payload: AdminRoomPayload) => {
      if (!assertAdminTestAction(socket, payload.roomId)) {
        return;
      }
      const room = rooms.get(adminTestRoomId);
      if (!room) return;

      room.game = advanceAdminTestRound(room.game);
      syncRoom(io, room);
      broadcastRoomLists(io);
    });

    socket.on(SocketEvents.ADMIN_ADJUST_RESOURCE, (payload: AdminAdjustResourcePayload) => {
      if (!assertAdminTestAction(socket, payload.roomId)) {
        return;
      }
      const room = rooms.get(adminTestRoomId);
      if (!room) return;

      room.game = adjustAdminTestResource(room.game, payload.playerId, payload.key, payload.delta);
      syncRoom(io, room);
    });

    socket.on(SocketEvents.END_ACTION, (payload: StartGamePayload) => {
      const room = rooms.get(payload.roomId);
      if (!room) {
        return;
      }

      room.game = engine.advancePhase(room.game);
      syncRoom(io, room);
      broadcastRoomLists(io);
    });

    socket.on("disconnect", () => {
      socketUsers.delete(socket.id);
    });
  });

  return io;
}

function getSocketUsername(socket: Socket, fallback: string): string {
  return socketUsers.get(socket.id) ?? fallback.trim();
}

function createNumericRoomId(): string {
  let roomId = "";
  do {
    roomId = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(roomId));
  return roomId;
}

function createRoomList(username?: string | null) {
  return Array.from(rooms.values()).map((room) => ({
    roomId: room.roomId,
    phase: room.game.phase,
    round: room.game.round,
    isTestRoom: isAdminTestRoom(room),
    players: room.game.players.map((player) => ({
      id: player.id,
      name: player.name,
    })),
  })).filter((room) => {
    if (room.isTestRoom) {
      return username === adminUsername;
    }
    return room.phase === "WAITING" && room.players.length > 0;
  });
}

function emitRoomList(socket: Socket): void {
  socket.emit(SocketEvents.ROOM_LIST, createRoomList(socketUsers.get(socket.id)));
}

function broadcastRoomLists(io: Server): void {
  io.sockets.sockets.forEach((socket) => emitRoomList(socket));
}

function findUserRoom(username: string): RoomRecord | null {
  return findRecoverableUserRoom(
    Array.from(rooms.values()).filter((room) => !isAdminTestRoom(room)),
    username,
    hasDepartedRoom,
  );
}

function leaveWaitingRoomsForUser(io: Server, socket: Socket, username: string, exceptRoomId?: string): void {
  Array.from(rooms.values()).forEach((room) => {
    if (room.roomId === exceptRoomId || room.game.phase !== "WAITING" || !room.game.players.some((player) => player.id === username)) {
      return;
    }

    room.game = engine.removePlayer(room.game, username);
    socket.leave(room.roomId);

    if (room.game.players.length === 0) {
      rooms.delete(room.roomId);
      deleteRoomSnapshot(room.roomId);
      return;
    }

    syncRoom(io, room);
  });
}

function syncUserRoom(io: Server, socket: Socket, username: string): void {
  const room = findUserRoom(username);
  if (!room) {
    return;
  }

  socket.join(room.roomId);
  socket.emit(SocketEvents.SYNC_STATE, {
    roomId: room.roomId,
    game: room.game,
  } satisfies RoomSnapshot);
  broadcastRoomLists(io);
}

function syncRoom(io: Server, room: RoomRecord): void {
  room.game = migrateGameState(room.game);
  room.updatedAt = new Date().toISOString();
  const snapshot: RoomSnapshot = {
    roomId: room.roomId,
    game: room.game,
  };

  if (!isAdminTestRoom(room)) {
    saveRoomSnapshot(snapshot);
  }
  io.to(room.roomId).emit(SocketEvents.SYNC_STATE, snapshot);
}

function migrateGameState(game: GameState): GameState {
  return {
    ...game,
    harvestField: game.harvestField ?? null,
    harvestBreeding: game.harvestBreeding ?? null,
    players: game.players.map((player) => ({
      ...player,
      farm: farmManager.migrateFarm(player.farm),
    })),
  };
}

function markDepartedRoom(roomId: string, username: string): void {
  const departedPlayers = departedRoomPlayers.get(roomId) ?? new Set<string>();
  departedPlayers.add(username);
  departedRoomPlayers.set(roomId, departedPlayers);
}

function hasDepartedRoom(roomId: string, username: string): boolean {
  return departedRoomPlayers.get(roomId)?.has(username) ?? false;
}

function ensureAdminTestRoom(): RoomRecord {
  const existing = rooms.get(adminTestRoomId);
  if (existing) {
    existing.game = keepAdminTestPlayable(migrateGameState(existing.game));
    return existing;
  }

  const room: RoomRecord = {
    roomId: adminTestRoomId,
    game: restartAdminTestGame(),
    updatedAt: new Date().toISOString(),
  };
  rooms.set(adminTestRoomId, room);
  return room;
}

function isAdminTestRoom(room: RoomRecord): boolean {
  return room.roomId === adminTestRoomId;
}

function assertAdminTestAction(socket: Socket, roomId: string): boolean {
  const username = socketUsers.get(socket.id);
  if (username !== adminUsername || roomId !== adminTestRoomId) {
    socket.emit(SocketEvents.ACTION_NOTICE, {
      message: "只有管理员可以操作测试房间。",
    });
    return false;
  }
  return true;
}

function restartAdminTestGame(): GameState {
  const waiting = engine.addPlayer(engine.createWaitingGame(adminTestRoomId), {
    id: adminUsername,
    name: adminUsername,
  });
  const started = engine.startGame({
    ...waiting,
    players: [
      ...waiting.players,
      {
        ...waiting.players[0],
        id: "test-2",
        name: "测试玩家",
      },
    ],
  });
  return keepAdminTestPlayable({
    ...started,
    players: started.players.map((player) =>
      player.id === adminUsername
        ? {
            ...player,
            resources: { ...adminTestResources },
          }
        : player,
    ),
    actionLog: ["测试房间已开启。"],
  });
}

function keepAdminTestPlayable(state: GameState): GameState {
  return {
    ...state,
    phase: "WORK_PHASE",
    stage: "WORK_PHASE",
    currentPlayer: adminUsername,
    currentPlayerIndex: Math.max(
      0,
      state.players.findIndex((player) => player.id === adminUsername),
    ),
    actionSpaces: state.actionSpaces.map((space) => ({ ...space, occupiedBy: null })),
    players: state.players.map((player) => ({
      ...player,
      workers:
        player.id === adminUsername
          ? player.workers.map((worker) => ({
              ...worker,
              location: "home" as const,
              actionSpaceId: null,
              availableRound: Math.min(worker.availableRound, state.round),
            }))
          : player.workers,
    })),
    harvestField: null,
    harvestFeeding: null,
    harvestBreeding: null,
    lastError: null,
  };
}

function placeAdminTestWorker(state: GameState, playerId: string, actionSpaceId: string, input: PlaceWorkerPayload["input"]): GameState {
  const adminState = keepAdminTestPlayable({
    ...state,
    currentPlayer: playerId,
  });
  const workerId = adminState.players.find((player) => player.id === playerId)?.workers[0]?.id;
  if (!workerId) {
    return {
      ...adminState,
      lastError: "测试房间没有可用工人。",
    };
  }
  const result = engine.placeWorker(adminState, playerId, workerId, actionSpaceId, input);
  return keepAdminTestPlayable({
    ...result,
    actionLog: result.actionLog,
  });
}

function advanceAdminTestRound(state: GameState): GameState {
  const targetRound = Math.min(14, Math.max(1, state.round + 1));
  const existingDeck = state.roundDeck.length > 0 ? state.roundDeck : engine.createWaitingGame("deck-source").roundDeck.slice(state.roundCards.length);
  let next = keepAdminTestPlayable({
    ...state,
    round: targetRound,
    roundDeck: existingDeck,
  });
  next = engine.advancePhase({
    ...next,
    phase: "ROUND_PREPARE",
    stage: "ROUND_PREPARE",
  });
  return keepAdminTestPlayable({
    ...next,
    actionLog: [...state.actionLog, `管理员推进到第 ${targetRound} 轮。`],
  });
}

function adjustAdminTestResource(state: GameState, playerId: string, key: AdminAdjustResourcePayload["key"], delta: number): GameState {
  const normalizedDelta = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  return {
    ...state,
    players: state.players.map((player) => {
      if (player.id !== playerId) return player;
      if (key === "begging") {
        return {
          ...player,
          beggingCards: Math.max(0, player.beggingCards + normalizedDelta),
        };
      }
      if (isAnimalKey(key)) {
        return {
          ...player,
          animals: {
            ...player.animals,
            [key]: Math.max(0, player.animals[key] + normalizedDelta),
          },
        };
      }
      return {
        ...player,
        resources: {
          ...player.resources,
          [key]: Math.max(0, player.resources[key] + normalizedDelta),
        },
      };
    }),
    actionLog: [...state.actionLog, `管理员调整 ${playerId} 的${adminResourceLabel(key)} ${normalizedDelta > 0 ? "+" : ""}${normalizedDelta}。`],
  };
}

function isAnimalKey(key: AdminAdjustResourcePayload["key"]): key is keyof AnimalState {
  return key === "sheep" || key === "boar" || key === "cattle";
}

function adminResourceLabel(key: AdminAdjustResourcePayload["key"]): string {
  const labels: Record<AdminAdjustResourcePayload["key"], string> = {
    wood: "木材",
    clay: "黏土",
    reed: "芦苇",
    stone: "石头",
    grain: "谷物",
    vegetable: "蔬菜",
    food: "食物",
    sheep: "羊",
    boar: "野猪",
    cattle: "牛",
    begging: "乞讨卡",
  };
  return labels[key];
}

function routePlaceWorker(io: Server, payload: PlaceWorkerPayload): void {
  const room = rooms.get(payload.roomId);
  if (!room) {
    return;
  }

  room.game = isAdminTestRoom(room)
    ? placeAdminTestWorker(room.game, payload.playerId, payload.actionSpaceId, payload.input)
    : engine.placeWorker(room.game, payload.playerId, payload.workerId, payload.actionSpaceId, payload.input);
  syncRoom(io, room);
  if (!isAdminTestRoom(room)) {
    scheduleAutoAdvanceNonInteractivePhases(io, room);
  }
  broadcastRoomLists(io);
}

function scheduleAutoAdvanceNonInteractivePhases(io: Server, room: RoomRecord): void {
  if (!autoAdvancePhases.has(room.game.phase)) {
    return;
  }

  clearScheduledAutoAdvance(room.roomId);
  const roomId = room.roomId;
  const phaseToAdvance = room.game.phase;

  const noticeTimer = setTimeout(() => {
    const currentRoom = rooms.get(roomId);
    if (!currentRoom || currentRoom.game.phase !== phaseToAdvance) {
      clearScheduledAutoAdvance(roomId);
      return;
    }

    io.to(roomId).emit(SocketEvents.ACTION_NOTICE, {
      message: createAutoAdvanceNotice(currentRoom.game),
    });

    const advanceTimer = setTimeout(() => {
      const latestRoom = rooms.get(roomId);
      if (!latestRoom || latestRoom.game.phase !== phaseToAdvance) {
        clearScheduledAutoAdvance(roomId);
        return;
      }

      latestRoom.game = autoAdvanceNonInteractivePhases(latestRoom.game);
      syncRoom(io, latestRoom);
      broadcastRoomLists(io);
      clearScheduledAutoAdvance(roomId);
    }, 1000);

    scheduledAutoAdvances.set(roomId, [noticeTimer, advanceTimer]);
  }, 500);

  scheduledAutoAdvances.set(roomId, [noticeTimer]);
}

function clearScheduledAutoAdvance(roomId: string): void {
  const timers = scheduledAutoAdvances.get(roomId);
  if (!timers) {
    return;
  }

  timers.forEach((timer) => clearTimeout(timer));
  scheduledAutoAdvances.delete(roomId);
}

function createAutoAdvanceNotice(state: GameState): string {
  if (state.phase === "RETURN_HOME") {
    const afterReturnHome = engine.advancePhase(state);
    return afterReturnHome.phase === "HARVEST" ? "工人回家，进入收获阶段。" : "工人回家，准备下一回合。";
  }

  if (state.phase === "HARVEST") {
    return "收获田地。";
  }

  if (state.phase === "NEXT_ROUND") {
    return "进入下一回合。";
  }

  return "回合准备完成。";
}

function autoAdvanceNonInteractivePhases(state: GameState): GameState {
  let next = state;

  while (autoAdvancePhases.has(next.phase)) {
    if (
      next.phase === "HARVEST" &&
      (next.harvestField?.round === next.round || next.harvestFeeding?.round === next.round || next.harvestBreeding?.round === next.round)
    ) {
      break;
    }
    const advanced = engine.advancePhase(next);
    if (advanced === next) {
      break;
    }
    next = advanced;
  }

  return next;
}

function emitUnavailableCardNotice(io: Server, socket: Socket, payload: CardActionPayload): void {
  socket.emit(SocketEvents.ACTION_NOTICE, {
    message: engine.unavailableCardNotice(),
  });

  const room = rooms.get(payload.roomId);
  if (room) {
    syncRoom(io, room);
  }
}
