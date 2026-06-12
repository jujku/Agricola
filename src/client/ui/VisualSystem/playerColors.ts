import type { PlayerState } from "../../../state/PlayerState";

export const PLAYER_COLORS = ["#C84040", "#3A7AC8", "#D9A441", "#4E8C3A", "#8A4AC8", "#C87834"] as const;

export function getPlayerColor(index: number): string {
  return PLAYER_COLORS[Math.max(0, index) % PLAYER_COLORS.length];
}

export function getPlayerColorById(players: PlayerState[], playerId: string | null | undefined): string {
  const index = players.findIndex((player) => player.id === playerId);
  return getPlayerColor(index < 0 ? 0 : index);
}
