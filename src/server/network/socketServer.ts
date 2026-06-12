import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { GameEngine } from "../../engine/GameEngine";
import { SocketEvents } from "../../shared/socketEvents";
import type {
  AuthPayload,
  CardActionPayload,
  CreateRoomPayload,
  JoinRoomPayload,
  LeaveRoomPayload,
  PlaceWorkerPayload,
  RestoreSessionPayload,
  RoomSnapshot,
  StartGamePayload,
  SubmitHarvestFeedingPayload,
} from "../../shared/types";
import type { GameState } from "../../state/GameState";
import { createAuthToken, resolveAuthToken } from "../db/authTokens";
import { deleteRoomSnapshot, loadRoomSnapshots, loginUser, registerUser, saveRoomSnapshot } from "../db/sqlite";

interface RoomRecord {
  roomId: string;
  game: GameState;
}

const rooms = new Map<string, RoomRecord>();
const engine = new GameEngine();
const socketUsers = new Map<string, string>();
const departedRoomPlayers = new Map<string, Set<string>>();
const autoAdvancePhases: ReadonlySet<GameState["phase"]> = new Set(["RETURN_HOME", "NEXT_ROUND", "ROUND_PREPARE"]);
const scheduledAutoAdvances = new Map<string, Array<ReturnType<typeof setTimeout>>>();

export function attachSocketServer(httpServer: HttpServer): Server {
  loadRoomSnapshots().forEach((snapshot) => {
    if (snapshot.game.phase === "WAITING" || snapshot.game.players.length === 0) {
      deleteRoomSnapshot(snapshot.roomId);
      return;
    }

    rooms.set(snapshot.roomId, {
      roomId: snapshot.roomId,
      game: snapshot.game,
    });
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    socket.emit(SocketEvents.ROOM_LIST, createRoomList());

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
      socket.emit(SocketEvents.ROOM_LIST, createRoomList());
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
      socket.emit(SocketEvents.ROOM_LIST, createRoomList());
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
      socket.emit(SocketEvents.ROOM_LIST, createRoomList());
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
      const room: RoomRecord = { roomId, game };

      rooms.set(roomId, room);
      socket.join(roomId);
      syncRoom(io, room);
      io.emit(SocketEvents.ROOM_LIST, createRoomList());
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
      io.emit(SocketEvents.ROOM_LIST, createRoomList());
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
        io.emit(SocketEvents.ROOM_LIST, createRoomList());
        return;
      }

      socket.leave(payload.roomId);
      markDepartedRoom(payload.roomId, username);
      socket.emit(SocketEvents.ROOM_LEFT, {
        roomId: payload.roomId,
        message: "已退出房间。游戏已经开始，不能中途重新加入。",
      });
      socket.emit(SocketEvents.ROOM_LIST, createRoomList());
    });

    socket.on(SocketEvents.START_GAME, (payload: StartGamePayload) => {
      const room = rooms.get(payload.roomId);
      if (!room) {
        return;
      }

      room.game = engine.startGame(room.game);
      syncRoom(io, room);
      io.emit(SocketEvents.ROOM_LIST, createRoomList());
    });

    socket.on(SocketEvents.PLACE_WORKER, (payload: PlaceWorkerPayload) => {
      const room = rooms.get(payload.roomId);
      if (!room) {
        return;
      }

      room.game = engine.placeWorker(room.game, payload.playerId, payload.workerId, payload.actionSpaceId, payload.input);
      syncRoom(io, room);
      scheduleAutoAdvanceNonInteractivePhases(io, room);
      io.emit(SocketEvents.ROOM_LIST, createRoomList());
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
      });
      syncRoom(io, room);

      if (beforePhase === "HARVEST" && (room.game.phase !== "HARVEST" || room.game.round !== beforeRound)) {
        io.to(room.roomId).emit(SocketEvents.ACTION_NOTICE, {
          message: "喂养完成，动物繁殖，进入下一回合。",
        });
        scheduleAutoAdvanceNonInteractivePhases(io, room);
      }

      io.emit(SocketEvents.ROOM_LIST, createRoomList());
    });

    socket.on(SocketEvents.END_ACTION, (payload: StartGamePayload) => {
      const room = rooms.get(payload.roomId);
      if (!room) {
        return;
      }

      room.game = engine.advancePhase(room.game);
      syncRoom(io, room);
      io.emit(SocketEvents.ROOM_LIST, createRoomList());
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

function createRoomList() {
  return Array.from(rooms.values()).map((room) => ({
    roomId: room.roomId,
    phase: room.game.phase,
    round: room.game.round,
    players: room.game.players.map((player) => ({
      id: player.id,
      name: player.name,
    })),
  })).filter((room) => room.phase === "WAITING" && room.players.length > 0);
}

function findUserRoom(username: string): RoomRecord | null {
  return (
    Array.from(rooms.values()).find(
      (room) => !hasDepartedRoom(room.roomId, username) && room.game.players.some((player) => player.id === username),
    ) ?? null
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
  io.emit(SocketEvents.ROOM_LIST, createRoomList());
}

function syncRoom(io: Server, room: RoomRecord): void {
  const snapshot: RoomSnapshot = {
    roomId: room.roomId,
    game: room.game,
  };

  saveRoomSnapshot(snapshot);
  io.to(room.roomId).emit(SocketEvents.SYNC_STATE, snapshot);
}

function markDepartedRoom(roomId: string, username: string): void {
  const departedPlayers = departedRoomPlayers.get(roomId) ?? new Set<string>();
  departedPlayers.add(username);
  departedRoomPlayers.set(roomId, departedPlayers);
}

function hasDepartedRoom(roomId: string, username: string): boolean {
  return departedRoomPlayers.get(roomId)?.has(username) ?? false;
}

function routePlaceWorker(io: Server, payload: PlaceWorkerPayload): void {
  const room = rooms.get(payload.roomId);
  if (!room) {
    return;
  }

  room.game = engine.placeWorker(room.game, payload.playerId, payload.workerId, payload.actionSpaceId, payload.input);
  syncRoom(io, room);
  scheduleAutoAdvanceNonInteractivePhases(io, room);
  io.emit(SocketEvents.ROOM_LIST, createRoomList());
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
      io.emit(SocketEvents.ROOM_LIST, createRoomList());
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

  if (state.phase === "NEXT_ROUND") {
    return "进入下一回合。";
  }

  return "回合准备完成。";
}

function autoAdvanceNonInteractivePhases(state: GameState): GameState {
  let next = state;

  while (autoAdvancePhases.has(next.phase)) {
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
