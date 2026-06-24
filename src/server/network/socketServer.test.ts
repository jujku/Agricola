import { describe, expect, it } from "vitest";
import type { GameState } from "../../state/GameState";
import type { RecoverableRoomRecord } from "./roomRecovery";
import { redactHandsForUser, shouldDeleteStoredRoomOnStartup } from "./socketServer";
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
      options: { enableCardDraft: false, draftTimeLimitMinutes: null },
      hostPlayerId: players[0] ?? null,
      readyPlayerIds: players[0] ? [players[0]] : [],
      gameEndConfirmedPlayerIds: [],
      players: players.map((id) => ({ id, name: id }) as GameState["players"][number]),
      actionSpaces: [],
      roundCards: [],
      currentPlayer: null,
      startingPlayer: players[0] ?? null,
      pendingActionAccess: null,
      pendingCardChoice: null,
      workPhaseActionCount: 0,
      lastActionOrdinalByPlayerId: {},
      roundDeck: [],
      occupationDeck: [],
      minorImprovementDeck: [],
      majorImprovements: [],
      harvestField: null,
      harvestFeeding: null,
      harvestBreeding: null,
      cardDraft: null,
      currentPlayerIndex: 0,
      actionLog: [],
      winnerIds: [],
      lastError: null,
    },
  };
}

describe("socket room recovery", () => {
  it("deletes stored rooms on startup unless they are finished games", () => {
    expect(shouldDeleteStoredRoomOnStartup(room("waiting", "WAITING", 0, "2026-06-12T19:46:44.245Z"))).toBe(true);
    expect(shouldDeleteStoredRoomOnStartup(room("active", "WORK_PHASE", 5, "2026-06-12T19:46:44.245Z"))).toBe(true);
    expect(shouldDeleteStoredRoomOnStartup(room("ended", "GAME_END", 14, "2026-06-12T19:46:44.245Z"))).toBe(false);
  });

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

  it("redacts other players' hands and draft packs from sync snapshots", () => {
    const game: GameState = {
      ...room("draft", "CARD_DRAFT", 1, "2026-06-12T19:46:44.245Z").game,
      options: { enableCardDraft: true, draftTimeLimitMinutes: null },
      players: [
        {
          id: "jujku",
          name: "jujku",
          occupationHand: ["paper-maker"],
          minorImprovementHand: ["caravan"],
        },
        {
          id: "eren",
          name: "eren",
          occupationHand: ["scholar"],
          minorImprovementHand: ["brook"],
        },
      ] as GameState["players"],
      cardDraft: {
        round: 1,
        picksPerPlayer: 7,
        direction: "left",
        packs: [
          { playerId: "jujku", minorImprovementIds: ["bottles"], occupationIds: ["tutor"] },
          { playerId: "eren", minorImprovementIds: ["mantelpiece"], occupationIds: ["groom"] },
        ],
        pendingSelections: {
          eren: { minorImprovementId: "mantelpiece", occupationId: "groom" },
        },
      },
    };

    const snapshot = redactHandsForUser(game, "jujku");

    expect(snapshot.players.find((player) => player.id === "jujku")?.minorImprovementHand).toEqual(["caravan"]);
    expect(snapshot.players.find((player) => player.id === "eren")?.minorImprovementHand).toEqual([]);
    expect(snapshot.cardDraft?.packs.find((pack) => pack.playerId === "jujku")?.minorImprovementIds).toEqual(["bottles"]);
    expect(snapshot.cardDraft?.packs.find((pack) => pack.playerId === "eren")?.minorImprovementIds).toEqual([]);
    expect(snapshot.cardDraft?.pendingSelections.eren).toEqual({ minorImprovementId: "", occupationId: "" });
  });
});
