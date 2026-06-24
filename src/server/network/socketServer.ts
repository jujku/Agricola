import type { Server as HttpServer } from "node:http";
import { createHash } from "node:crypto";
import { Server, type Socket } from "socket.io";
import { GameEngine } from "../../engine/GameEngine";
import { SocketEvents } from "../../shared/socketEvents";
import type {
  AdminAddCardToHandPayload,
  AdminAdjustResourcePayload,
  AdminRoomPayload,
  AdminToggleActionSpaceOccupiedPayload,
  AddComputerPlayerPayload,
  AuthPayload,
  CardActionPayload,
  CookWithMajorImprovementPayload,
  CreateRoomPayload,
  ConfirmGameEndPayload,
  JoinRoomPayload,
  LeaveRoomPayload,
  PlaceWorkerPayload,
  RestoreSessionPayload,
  RoomSnapshot,
  SetPlayerReadyPayload,
  StartGamePayload,
  SubmitCardChoicePayload,
  SubmitCardDraftPickPayload,
  SubmitHarvestFieldPayload,
  SubmitHarvestFeedingPayload,
  SubmitHarvestBreedingPayload,
  ActionInput,
} from "../../shared/types";
import type { GameState } from "../../state/GameState";
import type { ActionSpaceState } from "../../state/ActionSpaceState";
import type { FarmAnimalType } from "../../state/FarmState";
import type { AnimalState, PlayerState, ResourceState } from "../../state/PlayerState";
import type { ActionEffect, AnimalKey, ResourceKey } from "../../config/baseActions";
import { getMinorImprovement } from "../../config/minorImprovements";
import { getOccupation } from "../../config/occupations";
import { FarmManager } from "../../engine/FarmManager";
import { createAuthToken, resolveAuthToken } from "../db/authTokens";
import { deleteRoomSnapshot, ensureUser, loadStoredRoomSnapshots, loginUser, registerUser, saveRoomSnapshot } from "../db/sqlite";
import { findRecoverableUserRoom } from "./roomRecovery";

export interface RoomRecord {
  roomId: string;
  game: GameState;
  updatedAt: string;
  roomPasswordHash: string | null;
  draftTimeLimitMinutes: number | null;
}

const rooms = new Map<string, RoomRecord>();
const engine = new GameEngine();
const farmManager = new FarmManager();
const socketUsers = new Map<string, string>();
const departedRoomPlayers = new Map<string, Set<string>>();
const autoAdvancePhases: ReadonlySet<GameState["phase"]> = new Set(["RETURN_HOME", "HARVEST", "NEXT_ROUND", "ROUND_PREPARE"]);
const scheduledAutoAdvances = new Map<string, Array<ReturnType<typeof setTimeout>>>();
const scheduledComputerTurns = new Map<string, ReturnType<typeof setTimeout>>();
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
    if (shouldDeleteStoredRoomOnStartup(snapshot)) {
      deleteRoomSnapshot(snapshot.roomId);
      return;
    }

    rooms.set(snapshot.roomId, {
      roomId: snapshot.roomId,
      game: migrateGameState(snapshot.game),
      updatedAt,
      roomPasswordHash: null,
      draftTimeLimitMinutes: snapshot.game.options?.draftTimeLimitMinutes ?? null,
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

      const draftTimeLimitMinutes = normalizeDraftTimeLimit(payload.draftTimeLimitMinutes);
      const roomId = createNumericRoomId();
      const game = engine.addPlayer(engine.createWaitingGame(roomId, { enableCardDraft: Boolean(payload.enableCardDraft), draftTimeLimitMinutes }), {
        id: username,
        name: username,
      });
      const room: RoomRecord = {
        roomId,
        game,
        updatedAt: new Date().toISOString(),
        roomPasswordHash: hashRoomPassword(payload.roomPassword ?? ""),
        draftTimeLimitMinutes,
      };

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
        socket.emit(SocketEvents.SYNC_STATE, createRoomSnapshotForUser(room, username));
        return;
      }

      if (!isRoomPasswordValid(room, payload.roomPassword ?? "")) {
        socket.emit(SocketEvents.ACTION_NOTICE, {
          message: "房间密码不正确。",
        });
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
          socket.emit(SocketEvents.SYNC_STATE, createRoomSnapshotForUser(room, username));
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

      if (room.game.phase === "GAME_END") {
        room.game = confirmGameEndForPlayer(room.game, username);
        socket.leave(payload.roomId);
        socket.emit(SocketEvents.ROOM_LEFT, {
          roomId: payload.roomId,
          message: "已离开已结束房间。",
        });
        destroyRoomIfAllGameEndConfirmed(io, room);
        broadcastRoomLists(io);
        return;
      }

      socket.leave(payload.roomId);
      markDepartedRoom(payload.roomId, username);
      room.game = engine.declareRemainingPlayerWinner(room.game, username);
      syncRoom(io, room);
      if (room.game.phase === "GAME_END") {
        clearScheduledAutoAdvance(payload.roomId);
      }
      socket.emit(SocketEvents.ROOM_LEFT, {
        roomId: payload.roomId,
        message: "已退出房间。游戏已经开始，不能中途重新加入。",
      });
      broadcastRoomLists(io);
    });

    socket.on(SocketEvents.SET_PLAYER_READY, (payload: SetPlayerReadyPayload) => {
      const room = rooms.get(payload.roomId);
      const username = socketUsers.get(socket.id);
      if (!room || username !== payload.playerId) {
        return;
      }
      room.game = engine.setPlayerReady(room.game, payload.playerId, payload.ready);
      syncRoom(io, room);
      broadcastRoomLists(io);
    });

    socket.on(SocketEvents.START_GAME, (payload: StartGamePayload) => {
      const room = rooms.get(payload.roomId);
      if (!room) {
        return;
      }
      const username = socketUsers.get(socket.id);
      if (!isAdminTestRoom(room) && username !== room.game.hostPlayerId) {
        socket.emit(SocketEvents.ACTION_NOTICE, {
          message: "只有房主可以开始游戏。",
        });
        return;
      }

      room.game = isAdminTestRoom(room) ? restartAdminTestGame() : engine.startGame(room.game);
      syncRoom(io, room);
      scheduleCardDraftTimeout(io, room);
      scheduleComputerTurn(io, room);
      broadcastRoomLists(io);
    });

    socket.on(SocketEvents.ADD_COMPUTER_PLAYER, (payload: AddComputerPlayerPayload) => {
      const room = rooms.get(payload.roomId);
      const username = socketUsers.get(socket.id);
      if (!room || room.game.phase !== "WAITING") {
        return;
      }
      if (username !== room.game.hostPlayerId && !isAdminTestRoom(room)) {
        socket.emit(SocketEvents.ACTION_NOTICE, {
          message: "只有房主可以添加电脑玩家。",
        });
        return;
      }

      room.game = engine.addComputerPlayer(room.game);
      syncRoom(io, room);
      broadcastRoomLists(io);
    });

    socket.on(SocketEvents.CONFIRM_GAME_END, (payload: ConfirmGameEndPayload) => {
      const room = rooms.get(payload.roomId);
      const username = socketUsers.get(socket.id);
      if (!room || username !== payload.playerId || room.game.phase !== "GAME_END") {
        return;
      }
      room.game = confirmGameEndForPlayer(room.game, payload.playerId);
      syncRoom(io, room);
      destroyRoomIfAllGameEndConfirmed(io, room);
      broadcastRoomLists(io);
    });

    socket.on(SocketEvents.SUBMIT_CARD_DRAFT_PICK, (payload: SubmitCardDraftPickPayload) => {
      const room = rooms.get(payload.roomId);
      const username = socketUsers.get(socket.id);
      if (!room) {
        return;
      }
      if (username !== payload.playerId) {
        socket.emit(SocketEvents.ACTION_NOTICE, {
          message: "只能提交自己的轮抽选择。",
        });
        return;
      }

      room.game = engine.submitCardDraftPick(room.game, payload.playerId, payload.minorImprovementId, payload.occupationId);
      syncRoom(io, room);
      scheduleCardDraftTimeout(io, room);
      scheduleComputerTurn(io, room);
      if (room.game.phase === "ROUND_PREPARE") {
        scheduleAutoAdvanceNonInteractivePhases(io, room);
      }
      broadcastRoomLists(io);
    });

    socket.on(SocketEvents.SUBMIT_CARD_CHOICE, (payload: SubmitCardChoicePayload) => {
      const room = rooms.get(payload.roomId);
      const username = socketUsers.get(socket.id);
      if (!room) {
        return;
      }
      if (username !== payload.playerId && !isAdminTestRoom(room)) {
        socket.emit(SocketEvents.ACTION_NOTICE, {
          message: "只能提交自己的卡牌选择。",
        });
        return;
      }

      room.game = engine.submitPendingCardChoice(room.game, payload.playerId, payload.input ?? {});
      syncRoom(io, room);
      scheduleAutoAdvanceNonInteractivePhases(io, room);
      scheduleComputerTurn(io, room);
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
        scheduleComputerTurn(io, room);
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
      if (isAdminTestRoom(room)) {
        room.game = resolveAdminTestHarvestFollowers(room.game);
      }
      syncRoom(io, room);
      scheduleComputerTurn(io, room);
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
      if (isAdminTestRoom(room)) {
        room.game = resolveAdminTestHarvestFollowers(room.game);
      }
      syncRoom(io, room);

      if (beforePhase === "HARVEST" && (room.game.phase !== "HARVEST" || room.game.round !== beforeRound)) {
        io.to(room.roomId).emit(SocketEvents.ACTION_NOTICE, {
          message: "喂养完成，动物繁殖，进入下一回合。",
        });
        scheduleAutoAdvanceNonInteractivePhases(io, room);
        scheduleComputerTurn(io, room);
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
      if (isAdminTestRoom(room)) {
        room.game = resolveAdminTestHarvestFollowers(room.game);
      }
      syncRoom(io, room);
      scheduleAutoAdvanceNonInteractivePhases(io, room);
      scheduleComputerTurn(io, room);
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
      scheduleComputerTurn(io, room);
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

    socket.on(SocketEvents.ADMIN_START_HARVEST, (payload: AdminRoomPayload) => {
      if (!assertAdminTestAction(socket, payload.roomId)) {
        return;
      }
      const room = rooms.get(adminTestRoomId);
      if (!room) return;

      room.game = resolveAdminTestHarvestFollowers(startAdminTestHarvest(room.game));
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

    socket.on(SocketEvents.ADMIN_ADD_CARD_TO_HAND, (payload: AdminAddCardToHandPayload) => {
      if (!assertAdminTestAction(socket, payload.roomId)) {
        return;
      }
      const room = rooms.get(adminTestRoomId);
      if (!room) return;

      room.game = addAdminTestCardToHand(room.game, payload.playerId, payload.kind, payload.cardId);
      syncRoom(io, room);
    });

    socket.on(SocketEvents.ADMIN_TOGGLE_ACTION_SPACE_OCCUPIED, (payload: AdminToggleActionSpaceOccupiedPayload) => {
      if (!assertAdminTestAction(socket, payload.roomId)) {
        return;
      }
      const room = rooms.get(adminTestRoomId);
      if (!room) return;

      room.game = toggleAdminTestActionSpaceOccupied(room.game, payload.actionSpaceId);
      syncRoom(io, room);
    });

    socket.on(SocketEvents.END_ACTION, (payload: StartGamePayload) => {
      const room = rooms.get(payload.roomId);
      if (!room) {
        return;
      }

      room.game = engine.advancePhase(room.game);
      syncRoom(io, room);
      scheduleComputerTurn(io, room);
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
    enableCardDraft: room.game.options?.enableCardDraft ?? false,
    hasRoomPassword: Boolean(room.roomPasswordHash),
    draftTimeLimitMinutes: room.draftTimeLimitMinutes,
    isTestRoom: isAdminTestRoom(room),
    players: room.game.players.map((player) => ({
      id: player.id,
      name: player.name,
      isComputer: player.isComputer,
    })),
  })).filter((room) => {
    if (room.isTestRoom) {
      return username === adminUsername;
    }
    return room.phase === "WAITING" && room.players.length > 0;
  });
}

export function shouldDeleteStoredRoomOnStartup(snapshot: RoomSnapshot): boolean {
  return snapshot.game.players.length === 0 || snapshot.game.phase !== "GAME_END";
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
  socket.emit(SocketEvents.SYNC_STATE, createRoomSnapshotForUser(room, username));
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
  io.sockets.sockets.forEach((socket) => {
    if (!socket.rooms.has(room.roomId)) return;
    socket.emit(SocketEvents.SYNC_STATE, createRoomSnapshotForUser(room, socketUsers.get(socket.id) ?? null));
  });
}

function createRoomSnapshotForUser(room: RoomRecord, username: string | null): RoomSnapshot {
  return {
    roomId: room.roomId,
    game: redactHandsForUser(room.game, username),
  };
}

export function redactHandsForUser(game: GameState, username: string | null): GameState {
  return {
    ...game,
    cardDraft: redactCardDraftForUser(game.cardDraft ?? null, username),
    players: game.players.map((player) =>
      player.id === username
        ? player
        : {
            ...player,
            occupationHand: [],
            minorImprovementHand: [],
          },
    ),
  };
}

function redactCardDraftForUser(cardDraft: GameState["cardDraft"], username: string | null): GameState["cardDraft"] {
  if (!cardDraft) return null;
  return {
    ...cardDraft,
    packs: cardDraft.packs.map((pack) =>
      pack.playerId === username
        ? pack
        : {
            ...pack,
            minorImprovementIds: [],
            occupationIds: [],
          },
    ),
    pendingSelections: Object.fromEntries(
      Object.keys(cardDraft.pendingSelections).map((playerId) => [
        playerId,
        playerId === username
          ? cardDraft.pendingSelections[playerId]
          : {
              minorImprovementId: "",
              occupationId: "",
            },
      ]),
    ),
  };
}

function migrateGameState(game: GameState): GameState {
  return {
    ...game,
    options: {
      enableCardDraft: game.options?.enableCardDraft ?? false,
      draftTimeLimitMinutes: game.options?.draftTimeLimitMinutes ?? null,
    },
    hostPlayerId: game.hostPlayerId ?? game.players[0]?.id ?? null,
    readyPlayerIds: (game.readyPlayerIds ?? []).filter((id) => game.players.some((player) => player.id === id)),
    gameEndConfirmedPlayerIds: (game.gameEndConfirmedPlayerIds ?? []).filter((id) => game.players.some((player) => player.id === id)),
    occupationDeck: game.occupationDeck ?? [],
    minorImprovementDeck: game.minorImprovementDeck ?? [],
    harvestField: game.harvestField ?? null,
    harvestBreeding: game.harvestBreeding ?? null,
    cardDraft: game.cardDraft ?? null,
    pendingActionAccess: game.pendingActionAccess ?? null,
    pendingCardChoice: game.pendingCardChoice ?? null,
    players: game.players.map((player) => ({
      ...player,
      occupationHand: player.occupationHand ?? [],
      minorImprovementHand: player.minorImprovementHand ?? [],
      occupations: player.occupations ?? [],
      minorImprovements: player.minorImprovements ?? [],
      pendingFood: player.pendingFood ?? [],
      pendingGoods: player.pendingGoods ?? [],
      cardStates: player.cardStates ?? {},
      farm: farmManager.migrateFarm(player.farm),
    })),
  };
}

function normalizeDraftTimeLimit(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.min(Math.floor(value), 999);
}

function hashRoomPassword(password: string): string | null {
  const trimmed = password.trim();
  if (!trimmed) return null;
  return createHash("sha256").update(trimmed).digest("hex");
}

function isRoomPasswordValid(room: RoomRecord, password: string): boolean {
  if (!room.roomPasswordHash) return true;
  return hashRoomPassword(password) === room.roomPasswordHash;
}

function confirmGameEndForPlayer(game: GameState, playerId: string): GameState {
  if (game.phase !== "GAME_END" || !game.players.some((player) => player.id === playerId)) {
    return game;
  }
  return {
    ...game,
    gameEndConfirmedPlayerIds: Array.from(new Set([...(game.gameEndConfirmedPlayerIds ?? []), playerId])),
  };
}

function destroyRoomIfAllGameEndConfirmed(io: Server, room: RoomRecord): void {
  if (room.game.phase !== "GAME_END") return;
  const confirmed = new Set(room.game.gameEndConfirmedPlayerIds ?? []);
  if (!room.game.players.every((player) => confirmed.has(player.id))) {
    return;
  }
  clearScheduledAutoAdvance(room.roomId);
  clearScheduledComputerTurn(room.roomId);
  rooms.delete(room.roomId);
  deleteRoomSnapshot(room.roomId);
  io.to(room.roomId).emit(SocketEvents.ROOM_LEFT, {
    roomId: room.roomId,
    message: "所有玩家已确认结算，房间已关闭。",
  });
  io.in(room.roomId).socketsLeave(room.roomId);
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
    existing.roomPasswordHash = null;
    existing.draftTimeLimitMinutes = null;
    return existing;
  }

  const room: RoomRecord = {
    roomId: adminTestRoomId,
    game: restartAdminTestGame(),
    updatedAt: new Date().toISOString(),
    roomPasswordHash: null,
    draftTimeLimitMinutes: null,
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
    readyPlayerIds: [adminUsername, "test-2"],
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

function keepAdminTestPlayable(state: GameState, options: { clearActionSpaces?: boolean } = {}): GameState {
  const clearActionSpaces = options.clearActionSpaces ?? true;
  return {
    ...state,
    phase: "WORK_PHASE",
    stage: "WORK_PHASE",
    currentPlayer: adminUsername,
    currentPlayerIndex: Math.max(
      0,
      state.players.findIndex((player) => player.id === adminUsername),
    ),
    actionSpaces: clearActionSpaces ? state.actionSpaces.map((space) => ({ ...space, occupiedBy: null })) : state.actionSpaces,
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
    actionSpaces: state.actionSpaces.map((space) => (space.id === actionSpaceId ? { ...space, occupiedBy: null } : space)),
  }, { clearActionSpaces: false });
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
  }, { clearActionSpaces: false });
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

function startAdminTestHarvest(state: GameState): GameState {
  return engine.advancePhase({
    ...state,
    phase: "HARVEST",
    stage: "HARVEST",
    harvestField: null,
    harvestFeeding: null,
    harvestBreeding: null,
    actionLog: [...state.actionLog, `管理员进入第 ${state.round} 轮收获阶段。`],
    lastError: null,
  });
}

function resolveAdminTestHarvestFollowers(state: GameState): GameState {
  let next = state;
  const followerIds = next.players.filter((player) => player.id !== adminUsername).map((player) => player.id);
  let progressed = true;

  while (progressed) {
    progressed = false;
    if (next.phase !== "HARVEST") {
      return next;
    }

    if (next.stage === "HARVEST_FIELD" && next.harvestField) {
      const playerId = followerIds.find((id) => !next.harvestField?.submittedPlayerIds.includes(id));
      if (playerId) {
        next = engine.submitHarvestField(next, playerId);
        progressed = true;
      }
    } else if (next.stage === "HARVEST_FEEDING" && next.harvestFeeding) {
      const playerId = followerIds.find((id) => !next.harvestFeeding?.submittedPlayerIds.includes(id));
      if (playerId) {
        next = engine.submitHarvestFeeding(next, playerId, {
          grainToFood: 0,
          vegetableToFood: 0,
          cookedAnimals: [],
          cookedItems: [],
          harvestConversions: [],
        });
        progressed = true;
      }
    } else if (next.stage === "HARVEST_BREEDING" && next.harvestBreeding) {
      const playerId = followerIds.find((id) => !next.harvestBreeding?.submittedPlayerIds.includes(id));
      if (playerId) {
        const overflow = next.harvestBreeding.overflowByPlayerId[playerId] ?? {};
        next = engine.submitHarvestBreeding(next, playerId, {
          placements: [],
          cooked: [],
          discarded: (["sheep", "boar", "cattle"] as FarmAnimalType[])
            .filter((animal) => (overflow[animal] ?? 0) > 0)
            .map((animal) => ({ animal, count: overflow[animal] ?? 0 })),
        });
        progressed = true;
      }
    }
  }

  return next;
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

function addAdminTestCardToHand(state: GameState, playerId: string, kind: AdminAddCardToHandPayload["kind"], cardId: string): GameState {
  const card = kind === "minor" ? getMinorImprovement(cardId) : getOccupation(cardId);
  if (!card) {
    return {
      ...state,
      lastError: "没有找到这张卡。",
    };
  }
  return {
    ...state,
    players: state.players.map((player) => {
      if (player.id !== playerId) return player;
      if (kind === "minor") {
        return player.minorImprovementHand.includes(cardId)
          ? player
          : { ...player, minorImprovementHand: [...player.minorImprovementHand, cardId] };
      }
      return player.occupationHand.includes(cardId)
        ? player
        : { ...player, occupationHand: [...player.occupationHand, cardId] };
    }),
    actionLog: [...state.actionLog, `管理员把${card.name}加入 ${playerId} 的${kind === "minor" ? "小设施" : "职业"}手牌。`],
  };
}

function toggleAdminTestActionSpaceOccupied(state: GameState, actionSpaceId: string): GameState {
  const target = state.actionSpaces.find((space) => space.id === actionSpaceId);
  if (!target) {
    return {
      ...state,
      lastError: "没有找到这个行动格。",
    };
  }
  const occupiedBy = target.occupiedBy ? null : adminUsername;
  return {
    ...state,
    actionSpaces: state.actionSpaces.map((space) => (space.id === actionSpaceId ? { ...space, occupiedBy } : space)),
    actionLog: [
      ...state.actionLog,
      `管理员${occupiedBy ? "占用" : "清空"}行动格：${target.name}。`,
    ],
    lastError: null,
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
    scheduleComputerTurn(io, room);
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
      scheduleComputerTurn(io, latestRoom);
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

function scheduleComputerTurn(io: Server, room: RoomRecord): void {
  if (isAdminTestRoom(room)) return;
  if (!room.game.players.some((player) => player.isComputer)) return;

  const existing = scheduledComputerTurns.get(room.roomId);
  if (existing) {
    clearTimeout(existing);
  }

  const roomId = room.roomId;
  const timer = setTimeout(() => {
    scheduledComputerTurns.delete(roomId);
    const latestRoom = rooms.get(roomId);
    if (!latestRoom) return;

    const before = latestRoom.game;
    latestRoom.game = resolveComputerStep(latestRoom.game);
    if (latestRoom.game !== before) {
      syncRoom(io, latestRoom);
      scheduleAutoAdvanceNonInteractivePhases(io, latestRoom);
      scheduleCardDraftTimeout(io, latestRoom);
      broadcastRoomLists(io);
      scheduleComputerTurn(io, latestRoom);
    }
  }, 650);

  scheduledComputerTurns.set(roomId, timer);
}

function clearScheduledComputerTurn(roomId: string): void {
  const timer = scheduledComputerTurns.get(roomId);
  if (!timer) return;
  clearTimeout(timer);
  scheduledComputerTurns.delete(roomId);
}

function resolveComputerStep(state: GameState): GameState {
  if (state.pendingCardChoice) {
    return resolveComputerCardChoiceStep(state);
  }
  if (state.phase === "CARD_DRAFT") {
    return resolveComputerDraftStep(state);
  }
  if (state.phase === "WORK_PHASE") {
    return resolveComputerWorkStep(state);
  }
  if (state.phase === "HARVEST") {
    return resolveComputerHarvestStep(state);
  }
  return state;
}

function resolveComputerCardChoiceStep(state: GameState): GameState {
  const pending = state.pendingCardChoice;
  if (!pending) return state;
  const player = state.players.find((candidate) => candidate.id === pending.playerId && candidate.isComputer);
  if (!player) return state;
  const input = createComputerCardChoiceInput(player, pending);
  return input ? engine.submitPendingCardChoice(state, player.id, input) : state;
}

function createComputerCardChoiceInput(player: PlayerState, pending: NonNullable<GameState["pendingCardChoice"]>): ActionInput | null {
  if (pending.type === "gainAnimals") {
    const animal = (["sheep", "boar", "cattle"] as AnimalKey[]).find((candidate) => (pending.animals?.[candidate] ?? 0) > 0);
    if (!animal) return {};
    return {
      animalChoice: animal,
      animalPlacement: {
        animal,
        placements: [],
        cooked: 0,
        discarded: pending.animals?.[animal] ?? 0,
      },
    };
  }
  if (pending.type === "plowField") {
    const fieldCell = firstComputerFieldCell(player);
    return fieldCell ? { fieldCell } : null;
  }
  if (pending.type === "buildStable") {
    const stableCell = firstComputerStableCell(player);
    return stableCell ? { stableCells: [stableCell] } : null;
  }
  if (pending.type === "buildRoomOrRenovate") {
    const roomCell = firstComputerRoomCell(player);
    if (roomCell) return { roomCells: [roomCell], selectedEffectTypes: ["buildRooms"] };
    try {
      farmManager.renovate(player);
      return { selectedEffectTypes: ["renovate"], selectedEffectIds: ["card-renovate"] };
    } catch {
      return null;
    }
  }
  return null;
}

function resolveComputerDraftStep(state: GameState): GameState {
  if (!state.cardDraft) return state;
  const player = state.players.find((candidate) => candidate.isComputer && !state.cardDraft?.pendingSelections[candidate.id]);
  if (!player) return state;
  const pack = state.cardDraft.packs.find((candidate) => candidate.playerId === player.id);
  const minorImprovementId = pack?.minorImprovementIds[0];
  const occupationId = pack?.occupationIds[0];
  if (!minorImprovementId || !occupationId) return state;
  return engine.submitCardDraftPick(state, player.id, minorImprovementId, occupationId);
}

function resolveComputerHarvestStep(state: GameState): GameState {
  if (state.stage === "HARVEST_FIELD" && state.harvestField) {
    const player = state.players.find((candidate) => candidate.isComputer && !state.harvestField?.submittedPlayerIds.includes(candidate.id));
    return player ? engine.submitHarvestField(state, player.id) : state;
  }
  if (state.stage === "HARVEST_FEEDING" && state.harvestFeeding) {
    const player = state.players.find((candidate) => candidate.isComputer && !state.harvestFeeding?.submittedPlayerIds.includes(candidate.id));
    return player
      ? engine.submitHarvestFeeding(state, player.id, {
          grainToFood: 0,
          vegetableToFood: 0,
          cookedAnimals: [],
          cookedItems: [],
          harvestConversions: [],
        })
      : state;
  }
  if (state.stage === "HARVEST_BREEDING" && state.harvestBreeding) {
    const player = state.players.find((candidate) => candidate.isComputer && !state.harvestBreeding?.submittedPlayerIds.includes(candidate.id));
    if (!player) return state;
    const overflow = state.harvestBreeding.overflowByPlayerId[player.id] ?? {};
    return engine.submitHarvestBreeding(state, player.id, {
      placements: [],
      cooked: [],
      discarded: (["sheep", "boar", "cattle"] as FarmAnimalType[])
        .filter((animal) => (overflow[animal] ?? 0) > 0)
        .map((animal) => ({ animal, count: overflow[animal] ?? 0 })),
    });
  }
  return state;
}

function resolveComputerWorkStep(state: GameState): GameState {
  const player = state.players.find((candidate) => candidate.id === state.currentPlayer && candidate.isComputer);
  if (!player) return state;
  const worker = player.workers.find((candidate) => candidate.location === "home" && candidate.availableRound <= state.round);
  if (!worker) return state;

  const candidates = state.actionSpaces
    .filter((space) => !space.occupiedBy && isVisibleToComputer(space, player))
    .map((space) => createComputerActionPlan(state, player, space))
    .filter((plan): plan is ComputerActionPlan => Boolean(plan))
    .sort((left, right) => right.score - left.score);

  for (const plan of candidates) {
    const next = engine.placeWorker(state, player.id, worker.id, plan.actionSpaceId, plan.input);
    if (!next.lastError) {
      return next;
    }
  }

  return state;
}

type ComputerActionPlan = {
  actionSpaceId: string;
  input: ActionInput;
  score: number;
};

function createComputerActionPlan(state: GameState, player: PlayerState, actionSpace: ActionSpaceState): ComputerActionPlan | null {
  const direct = directComputerPlan(state, player, actionSpace, actionSpace.effects);
  if (!direct) return null;
  return {
    actionSpaceId: actionSpace.id,
    input: direct.input,
    score: direct.score + accumulatedScore(actionSpace),
  };
}

function directComputerPlan(
  state: GameState,
  player: PlayerState,
  actionSpace: ActionSpaceState,
  effects: ActionEffect[],
): { input: ComputerActionPlan["input"]; score: number } | null {
  if (effects.length === 1 && effects[0].type === "chooseOne") {
    return bestNestedComputerPlan(state, player, actionSpace, effects[0].effects, true);
  }
  if (effects.length === 1 && effects[0].type === "chooseAny") {
    return bestNestedComputerPlan(state, player, actionSpace, effects[0].effects, false);
  }

  const input: ComputerActionPlan["input"] = {};
  let score = 0;
  for (const effect of effects) {
    const plan = singleComputerEffectPlan(state, player, actionSpace, effect);
    if (!plan) return null;
    Object.assign(input, plan.input);
    score += plan.score;
  }
  return { input, score };
}

function bestNestedComputerPlan(
  state: GameState,
  player: PlayerState,
  actionSpace: ActionSpaceState,
  effects: ActionEffect[],
  chooseOne: boolean,
): { input: ComputerActionPlan["input"]; score: number } | null {
  const plans: Array<{ input: ComputerActionPlan["input"]; score: number }> = [];
  effects.forEach((effect) => {
    const child = effect.type === "chooseOne" || effect.type === "chooseAny"
      ? bestNestedComputerPlan(state, player, actionSpace, effect.effects, effect.type === "chooseOne")
      : singleComputerEffectPlan(state, player, actionSpace, effect);
    if (!child) return;
    const input: ActionInput = {
      ...child.input,
      selectedEffectTypes: [...new Set([effect.type, ...(child.input.selectedEffectTypes ?? [])])],
      selectedEffectIds: [...new Set([effect.id ?? effectKey(effect), ...(child.input.selectedEffectIds ?? [])])],
    };
    plans.push({ input, score: child.score });
  });

  plans.sort((left, right) => right.score - left.score);

  if (chooseOne) return plans[0] ?? null;
  return plans[0] ?? null;
}

function singleComputerEffectPlan(
  _state: GameState,
  player: PlayerState,
  actionSpace: ActionSpaceState,
  effect: ActionEffect,
): { input: ComputerActionPlan["input"]; score: number } | null {
  if (effect.type === "takeAccumulated") {
    const animal = accumulatedAnimal(actionSpace);
    return animal
      ? {
          input: { animalPlacement: { animal, placements: [], discarded: actionSpace.accumulated[animal] ?? 0, cooked: 0 } },
          score: 4 + (actionSpace.accumulated[animal] ?? 0),
        }
      : { input: {}, score: 5 + accumulatedScore(actionSpace) };
  }
  if (effect.type === "gainResource") {
    return { input: {}, score: resourceScore(effect.resource) * effect.amount };
  }
  if (effect.type === "buildingSupplies") {
    return { input: { resourceChoices: { first: "reed", second: "wood" } }, score: 5 };
  }
  if (effect.type === "takeStartingPlayer") {
    return { input: {}, score: 2 };
  }
  if (effect.type === "plowField") {
    const fieldCell = firstComputerFieldCell(player);
    return fieldCell ? { input: { fieldCell }, score: 2 } : null;
  }
  if (effect.type === "gainAnimal") {
    if ((effect.foodDelta ?? 0) < 0 && player.resources.food < Math.abs(effect.foodDelta ?? 0)) return null;
    return {
      input: {
        animalChoice: effect.animal,
        animalPlacement: { animal: effect.animal, placements: [], discarded: effect.amount, cooked: 0 },
      },
      score: 2 + effect.amount + (effect.foodDelta ?? 0),
    };
  }
  if (effect.type === "gainMissingAnimal") {
    const animal = (["sheep", "boar", "cattle"] as AnimalKey[]).find((candidate) => player.animals[candidate] <= 0) ?? "sheep";
    return {
      input: {
        animalChoice: animal,
        animalPlacement: { animal, placements: [], discarded: 1, cooked: 0 },
      },
      score: 2,
    };
  }
  return null;
}

function accumulatedAnimal(actionSpace: ActionSpaceState): AnimalKey | null {
  return (["sheep", "boar", "cattle"] as AnimalKey[]).find((animal) => (actionSpace.accumulated[animal] ?? 0) > 0) ?? null;
}

function accumulatedScore(actionSpace: ActionSpaceState): number {
  return Object.entries(actionSpace.accumulated).reduce((sum, [key, amount]) => {
    if (isResourceKey(key)) return sum + resourceScore(key) * amount;
    if (key === "sheep" || key === "boar" || key === "cattle") return sum + amount;
    return sum;
  }, 0);
}

function resourceScore(resource: ResourceKey): number {
  const scores: Record<ResourceKey, number> = {
    wood: 3,
    clay: 2,
    reed: 3,
    stone: 4,
    grain: 2,
    vegetable: 3,
    food: 3,
  };
  return scores[resource];
}

function isResourceKey(key: string): key is ResourceKey {
  return key === "wood" || key === "clay" || key === "reed" || key === "stone" || key === "grain" || key === "vegetable" || key === "food";
}

function effectKey(effect: ActionEffect): string {
  if (effect.type === "gainAnimal") return `${effect.type}:${effect.animal}`;
  if (effect.type === "gainResource") return `${effect.type}:${effect.resource}`;
  return effect.type;
}

function isVisibleToComputer(actionSpace: ActionSpaceState, player: PlayerState): boolean {
  return actionSpace.visibility !== "private" || actionSpace.ownerId === player.id;
}

function firstComputerFieldCell(player: PlayerState): ActionInput["fieldCell"] | null {
  for (const cell of player.farm.cells) {
    try {
      farmManager.plowField(player, { row: cell.row, col: cell.col });
      return { row: cell.row, col: cell.col };
    } catch {
      // Try the next cell; this is just a legality probe for the computer player.
    }
  }
  return null;
}

function firstComputerStableCell(player: PlayerState): ActionInput["fieldCell"] | null {
  for (const cell of player.farm.cells) {
    try {
      farmManager.buildStables(player, [{ row: cell.row, col: cell.col }], 1, 0);
      return { row: cell.row, col: cell.col };
    } catch {
      // Try the next cell; this is just a legality probe for the computer player.
    }
  }
  return null;
}

function firstComputerRoomCell(player: PlayerState): ActionInput["fieldCell"] | null {
  for (const cell of player.farm.cells) {
    try {
      farmManager.buildRooms(player, [{ row: cell.row, col: cell.col }]);
      return { row: cell.row, col: cell.col };
    } catch {
      // Try the next cell; this is just a legality probe for the computer player.
    }
  }
  return null;
}

function scheduleCardDraftTimeout(io: Server, room: RoomRecord): void {
  if (room.game.phase !== "CARD_DRAFT" || !room.game.cardDraft || !room.draftTimeLimitMinutes) {
    if (room.game.phase !== "CARD_DRAFT") {
      clearScheduledAutoAdvance(room.roomId);
    }
    return;
  }

  clearScheduledAutoAdvance(room.roomId);
  const roomId = room.roomId;
  const draftRound = room.game.cardDraft.round;
  const timer = setTimeout(() => {
    const latestRoom = rooms.get(roomId);
    if (!latestRoom || latestRoom.game.phase !== "CARD_DRAFT" || latestRoom.game.cardDraft?.round !== draftRound) {
      clearScheduledAutoAdvance(roomId);
      return;
    }

    latestRoom.game = autoSubmitCardDraftPicks(latestRoom.game);
    io.to(roomId).emit(SocketEvents.ACTION_NOTICE, {
      message: `轮抽第 ${draftRound} 轮时间到，未提交玩家已自动选择当前牌包第一张牌。`,
    });
    syncRoom(io, latestRoom);
    scheduleCardDraftTimeout(io, latestRoom);
    if (latestRoom.game.phase === "ROUND_PREPARE") {
      scheduleAutoAdvanceNonInteractivePhases(io, latestRoom);
    }
    broadcastRoomLists(io);
  }, room.draftTimeLimitMinutes * 60 * 1000);

  scheduledAutoAdvances.set(roomId, [timer]);
}

function autoSubmitCardDraftPicks(state: GameState): GameState {
  let next = state;
  const draft = state.cardDraft;
  if (!draft) return next;
  state.players.forEach((player) => {
    if (next.phase !== "CARD_DRAFT" || !next.cardDraft || next.cardDraft.pendingSelections[player.id]) {
      return;
    }
    const pack = next.cardDraft.packs.find((candidate) => candidate.playerId === player.id);
    const minorImprovementId = pack?.minorImprovementIds[0];
    const occupationId = pack?.occupationIds[0];
    if (!minorImprovementId || !occupationId) {
      return;
    }
    next = engine.submitCardDraftPick(next, player.id, minorImprovementId, occupationId);
  });
  return next;
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
