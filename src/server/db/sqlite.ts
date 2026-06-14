import { existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { RoomSnapshot } from "../../shared/types";

export interface StoredRoomSnapshot {
  snapshot: RoomSnapshot;
  updatedAt: string;
}

const databasePath = resolve(process.cwd(), "data", "agricola-lite.sqlite");

let database: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (!existsSync(dirname(databasePath))) {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  if (!database) {
    database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        room_id TEXT PRIMARY KEY,
        snapshot TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
  }
  return database;
}

export function saveRoomSnapshot(snapshot: RoomSnapshot): void {
  const updatedAt = new Date().toISOString();
  getDatabase()
    .prepare(
      `
        INSERT INTO rooms (room_id, snapshot, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(room_id) DO UPDATE SET
          snapshot = excluded.snapshot,
          updated_at = excluded.updated_at
      `,
    )
    .run(snapshot.roomId, JSON.stringify(snapshot), updatedAt);
}

export function deleteRoomSnapshot(roomId: string): void {
  getDatabase().prepare("DELETE FROM rooms WHERE room_id = ?").run(roomId);
}

export function loadRoomSnapshots(): RoomSnapshot[] {
  return loadStoredRoomSnapshots().map((record) => record.snapshot);
}

export function loadStoredRoomSnapshots(): StoredRoomSnapshot[] {
  const rows = getDatabase().prepare("SELECT snapshot, updated_at FROM rooms").all() as Array<{ snapshot: string; updated_at: string }>;
  return rows.map((row) => ({
    snapshot: JSON.parse(row.snapshot) as RoomSnapshot,
    updatedAt: row.updated_at,
  }));
}

export function registerUser(username: string, password: string): { ok: true } | { ok: false; message: string } {
  const cleanUsername = username.trim();
  if (!cleanUsername || !password) {
    return { ok: false, message: "请输入用户名和密码。" };
  }

  const existing = getDatabase().prepare("SELECT username FROM users WHERE username = ?").get(cleanUsername);
  if (existing) {
    return { ok: false, message: "用户名已存在。" };
  }

  getDatabase()
    .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
    .run(cleanUsername, hashPassword(password), new Date().toISOString());

  return { ok: true };
}

export function ensureUser(username: string, password: string): void {
  const cleanUsername = username.trim();
  if (!cleanUsername || !password) {
    return;
  }
  const existing = getDatabase().prepare("SELECT username FROM users WHERE username = ?").get(cleanUsername);
  if (existing) {
    return;
  }
  getDatabase()
    .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
    .run(cleanUsername, hashPassword(password), new Date().toISOString());
}

export function loginUser(username: string, password: string): { ok: true } | { ok: false; message: string } {
  const cleanUsername = username.trim();
  const row = getDatabase().prepare("SELECT password_hash FROM users WHERE username = ?").get(cleanUsername) as
    | { password_hash: string }
    | undefined;

  if (!row || row.password_hash !== hashPassword(password)) {
    return { ok: false, message: "用户名或密码错误。" };
  }

  return { ok: true };
}

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}
