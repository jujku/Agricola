import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface TokenRecord {
  token: string;
  username: string;
  createdAt: string;
  lastUsedAt: string;
}

const tokenPath = resolve(process.cwd(), "data", "auth-tokens.json");

export function createAuthToken(username: string): string {
  const tokens = loadTokens();
  const token = randomBytes(32).toString("hex");
  tokens.push({
    token,
    username,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  });
  saveTokens(tokens);
  return token;
}

export function resolveAuthToken(token: string): string | null {
  const tokens = loadTokens();
  const record = tokens.find((item) => item.token === token);
  if (!record) {
    return null;
  }
  record.lastUsedAt = new Date().toISOString();
  saveTokens(tokens);
  return record.username;
}

function loadTokens(): TokenRecord[] {
  ensureTokenFile();
  const raw = readFileSync(tokenPath, "utf8").trim();
  if (!raw) {
    return [];
  }
  return JSON.parse(raw) as TokenRecord[];
}

function saveTokens(tokens: TokenRecord[]): void {
  ensureTokenFile();
  writeFileSync(tokenPath, `${JSON.stringify(tokens, null, 2)}\n`, "utf8");
}

function ensureTokenFile(): void {
  if (!existsSync(dirname(tokenPath))) {
    mkdirSync(dirname(tokenPath), { recursive: true });
  }
  if (!existsSync(tokenPath)) {
    writeFileSync(tokenPath, "[]\n", "utf8");
  }
}
