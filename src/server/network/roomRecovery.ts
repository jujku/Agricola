import type { GameState } from "../../state/GameState";

export interface RecoverableRoomRecord {
  roomId: string;
  game: Pick<GameState, "phase" | "players">;
  updatedAt: string;
}

export function findRecoverableUserRoom<T extends RecoverableRoomRecord>(
  roomRecords: Iterable<T>,
  username: string,
  isDeparted: (roomId: string, username: string) => boolean,
): T | null {
  const candidates = Array.from(roomRecords).filter(
    (room) =>
      isRecoverablePhase(room.game.phase) &&
      !isDeparted(room.roomId, username) &&
      room.game.players.some((player) => player.id === username),
  );
  candidates.sort((left, right) => compareUpdatedAtDescending(left.updatedAt, right.updatedAt));
  return candidates[0] ?? null;
}

function isRecoverablePhase(phase: GameState["phase"]): boolean {
  return phase !== "WAITING" && phase !== "GAME_END";
}

function compareUpdatedAtDescending(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
  if (Number.isNaN(leftTime)) return 1;
  if (Number.isNaN(rightTime)) return -1;
  return rightTime - leftTime;
}
