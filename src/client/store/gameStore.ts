import { create } from "zustand";
import type { GameState } from "../../state/GameState";
import type { RoomListItem, RoomSnapshot } from "../../shared/types";

interface GameStore {
  connected: boolean;
  socketId: string | null;
  username: string | null;
  token: string | null;
  roomId: string | null;
  game: GameState | null;
  rooms: RoomListItem[];
  notice: string | null;
  setConnected: (connected: boolean) => void;
  setSocketId: (socketId: string | null) => void;
  setAuth: (username: string | null, token: string | null) => void;
  setRoomList: (rooms: RoomListItem[]) => void;
  syncState: (snapshot: RoomSnapshot) => void;
  leaveRoomLocal: (message?: string) => void;
  setNotice: (notice: string | null) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  connected: false,
  socketId: null,
  username: null,
  token: null,
  roomId: null,
  game: null,
  rooms: [],
  notice: null,
  setConnected: (connected) => set({ connected }),
  setSocketId: (socketId) => set({ socketId }),
  setAuth: (username, token) => set({ username, token }),
  setRoomList: (rooms) => set({ rooms }),
  syncState: (snapshot) =>
    set({
      roomId: snapshot.roomId,
      game: snapshot.game,
      notice: null,
    }),
  leaveRoomLocal: (message) =>
    set({
      roomId: null,
      game: null,
      notice: message ?? null,
    }),
  setNotice: (notice) => set({ notice }),
}));
