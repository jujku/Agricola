import { describe, expect, it } from "vitest";
import type { GameState } from "../../state/GameState";
import type { RecoverableRoomRecord } from "./roomRecovery";
import { findRecoverableUserRoom } from "./roomRecovery";

type TestRoomRecord = RecoverableRoomRecord & { game: GameState };

function room(roomId: string, phase: GameState["phase"], round: number, updatedAt: string, players = ["jujku", "eren"]): TestRoomRecord {
  return {
    roomId,
    updatedAt,
    game: {
      gameId: roomId,
      phase,
      round,
      stage: phase,
      players: players.map((id) => ({ id, name: id }) as GameState["players"][number]),
      actionSpaces: [],
      roundCards: [],
      currentPlayer: null,
      startingPlayer: players[0] ?? null,
      roundDeck: [],
      majorImprovements: [],
      harvestField: null,
      harvestFeeding: null,
      harvestBreeding: null,
      currentPlayerIndex: 0,
      actionLog: [],
      winnerIds: [],
      lastError: null,
    },
  };
}

describe("socket room recovery", () => {
  it("restores the latest active room instead of an older finished game", () => {
    const recovered = findRecoverableUserRoom(
      [
        room("9703", "GAME_END", 14, "2026-06-12T19:46:44.245Z"),
        room("1208", "WORK_PHASE", 5, "2026-06-12T20:41:22.540Z"),
      ],
      "jujku",
      () => false,
    );

    expect(recovered?.roomId).toBe("1208");
    expect(recovered?.game.round).toBe(5);
  });

  it("restores the newest active room when a player is in multiple active snapshots", () => {
    const recovered = findRecoverableUserRoom(
      [
        room("old", "WORK_PHASE", 2, "2026-06-12T16:40:14.095Z"),
        room("new", "HARVEST", 4, "2026-06-12T18:14:05.900Z"),
      ],
      "eren",
      () => false,
    );

    expect(recovered?.roomId).toBe("new");
  });

  it("does not auto recover a user into a finished game", () => {
    const recovered = findRecoverableUserRoom([room("9703", "GAME_END", 14, "2026-06-12T19:46:44.245Z")], "jujku", () => false);

    expect(recovered).toBeNull();
  });

  it("skips active rooms the user has already left", () => {
    const recovered = findRecoverableUserRoom(
      [
        room("left", "WORK_PHASE", 5, "2026-06-12T20:41:22.540Z"),
        room("current", "WORK_PHASE", 3, "2026-06-12T19:41:22.540Z"),
      ],
      "jujku",
      (roomId) => roomId === "left",
    );

    expect(recovered?.roomId).toBe("current");
  });
});
