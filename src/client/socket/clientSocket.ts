import { io } from "socket.io-client";
import { SocketEvents } from "../../shared/socketEvents";
import type {
  ActionInput,
  ActionNotice,
  AdminAdjustResourcePayload,
  AnimalCookInput,
  AnimalOverflowResolution,
  AuthSuccessPayload,
  HarvestConversionInput,
  RoomLeftPayload,
  RoomListItem,
  RoomSnapshot,
} from "../../shared/types";
import { useGameStore } from "../store/gameStore";

const tokenStorageKey = "agricola-lite-token";
const socketUrl =
  import.meta.env?.VITE_SOCKET_URL ??
  (typeof window !== "undefined" && window.location.port !== "5173" ? window.location.origin : "http://localhost:3000");
const socket = io(socketUrl, {
  autoConnect: true,
});

let wired = false;

export function wireSocketToStore(): () => void {
  if (wired) {
    return () => undefined;
  }

  wired = true;
  socket.on("connect", () => {
    useGameStore.getState().setConnected(true);
    useGameStore.getState().setSocketId(socket.id ?? null);
    const token = getStoredToken();
    if (token) {
      socket.emit(SocketEvents.RESTORE_SESSION, { token });
    }
  });
  socket.on("disconnect", () => {
    useGameStore.getState().setConnected(false);
    useGameStore.getState().setSocketId(null);
  });
  socket.on(SocketEvents.SYNC_STATE, (snapshot: RoomSnapshot) => {
    useGameStore.getState().syncState(snapshot);
  });
  socket.on(SocketEvents.ROOM_LEFT, (payload: RoomLeftPayload) => {
    useGameStore.getState().leaveRoomLocal(payload.message);
  });
  socket.on(SocketEvents.ACTION_NOTICE, (notice: ActionNotice) => {
    useGameStore.getState().setNotice(notice.message);
  });
  socket.on(SocketEvents.AUTH_SUCCESS, (payload: AuthSuccessPayload) => {
    storeToken(payload.token);
    useGameStore.getState().setAuth(payload.username, payload.token);
    useGameStore.getState().setNotice("登录成功。");
  });
  socket.on(SocketEvents.AUTH_ERROR, (notice: ActionNotice) => {
    useGameStore.getState().setNotice(notice.message);
  });
  socket.on(SocketEvents.ROOM_LIST, (rooms: RoomListItem[]) => {
    useGameStore.getState().setRoomList(rooms);
  });

  return () => {
    socket.off("connect");
    socket.off("disconnect");
    socket.off(SocketEvents.SYNC_STATE);
    socket.off(SocketEvents.ROOM_LEFT);
    socket.off(SocketEvents.ACTION_NOTICE);
    socket.off(SocketEvents.AUTH_SUCCESS);
    socket.off(SocketEvents.AUTH_ERROR);
    socket.off(SocketEvents.ROOM_LIST);
    wired = false;
  };
}

export function register(username: string, password: string): void {
  socket.emit(SocketEvents.REGISTER, { username, password });
}

export function login(username: string, password: string): void {
  socket.emit(SocketEvents.LOGIN, { username, password });
}

export function restoreSession(token: string): void {
  socket.emit(SocketEvents.RESTORE_SESSION, { token });
}

export function createRoom(playerName: string): void {
  socket.emit(SocketEvents.CREATE_ROOM, { playerName });
}

export function joinRoom(roomId: string, playerName: string): void {
  socket.emit(SocketEvents.JOIN_ROOM, { roomId, playerName });
}

export function leaveRoom(roomId: string): void {
  socket.emit(SocketEvents.LEAVE_ROOM, { roomId });
}

export function logout(): void {
  clearStoredToken();
  useGameStore.getState().logoutLocal();
  socket.disconnect();
  socket.connect();
}

export function startGame(roomId: string): void {
  socket.emit(SocketEvents.START_GAME, { roomId });
}

export function playOccupation(roomId: string, playerId: string): void {
  socket.emit(SocketEvents.PLAY_OCCUPATION, { roomId, playerId });
}

export function playImprovement(roomId: string, playerId: string): void {
  socket.emit(SocketEvents.PLAY_IMPROVEMENT, { roomId, playerId });
}

export function placeWorker(roomId: string, playerId: string, workerId: string, actionSpaceId: string, input: ActionInput): void {
  socket.emit(SocketEvents.PLACE_WORKER, {
    roomId,
    playerId,
    workerId,
    actionSpaceId,
    input,
  });
}

export function submitHarvestFeeding(
  roomId: string,
  playerId: string,
  grainToFood: number,
  vegetableToFood: number,
  cookedAnimals: AnimalCookInput[] = [],
  harvestConversions: HarvestConversionInput[] = [],
): void {
  socket.emit(SocketEvents.SUBMIT_HARVEST_FEEDING, {
    roomId,
    playerId,
    grainToFood,
    vegetableToFood,
    cookedAnimals,
    harvestConversions,
  });
}

export function submitHarvestField(roomId: string, playerId: string): void {
  socket.emit(SocketEvents.SUBMIT_HARVEST_FIELD, {
    roomId,
    playerId,
  });
}

export function submitHarvestBreeding(roomId: string, playerId: string, resolution: AnimalOverflowResolution): void {
  socket.emit(SocketEvents.SUBMIT_HARVEST_BREEDING, {
    roomId,
    playerId,
    resolution,
  });
}

export function cookWithMajorImprovement(roomId: string, playerId: string, improvementId: string, cookedAnimals: AnimalCookInput[]): void {
  socket.emit(SocketEvents.COOK_WITH_MAJOR_IMPROVEMENT, {
    roomId,
    playerId,
    improvementId,
    cookedAnimals,
  });
}

export function endAction(roomId: string): void {
  socket.emit(SocketEvents.END_ACTION, { roomId });
}

export function restartAdminTestRoom(roomId: string): void {
  socket.emit(SocketEvents.ADMIN_RESTART_TEST_ROOM, { roomId });
}

export function advanceAdminRound(roomId: string): void {
  socket.emit(SocketEvents.ADMIN_ADVANCE_ROUND, { roomId });
}

export function adjustAdminResource(roomId: string, playerId: string, key: AdminAdjustResourcePayload["key"], delta: number): void {
  socket.emit(SocketEvents.ADMIN_ADJUST_RESOURCE, { roomId, playerId, key, delta });
}

function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(tokenStorageKey);
}

function storeToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(tokenStorageKey, token);
}

function clearStoredToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(tokenStorageKey);
}
