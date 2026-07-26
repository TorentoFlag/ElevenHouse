import type { CreateClientJoinIntentResponse } from "@elevenhouse/contracts";

const legacyStorageKey = "elevenhouse.clientJoinIntentToken";
const contextStorageKey = "elevenhouse.clientJoinIntent";

export type PendingClientJoinIntent = Pick<
  CreateClientJoinIntentResponse,
  "astrologer" | "expiresAt" | "token"
>;

let memoryContext: PendingClientJoinIntent | null = null;
let memoryToken: string | null = null;

export function readClientJoinIntentToken(now = new Date()): string | null {
  return readPendingClientJoinIntent(now)?.token ?? getLegacyToken();
}

export function writeClientJoinIntentToken(token: string): void {
  const normalized = token.trim();
  if (!normalized) {
    clearClientJoinIntentToken();
    return;
  }

  memoryToken = normalized;
  getSessionStorage()?.setItem(legacyStorageKey, normalized);
}

export function writePendingClientJoinIntent(intent: PendingClientJoinIntent): void {
  const normalizedToken = intent.token.trim();
  if (!normalizedToken) {
    clearClientJoinIntentToken();
    return;
  }

  const context = {
    token: normalizedToken,
    astrologer: intent.astrologer,
    expiresAt: intent.expiresAt
  } satisfies PendingClientJoinIntent;

  memoryContext = context;
  memoryToken = normalizedToken;
  const storage = getSessionStorage();
  storage?.setItem(contextStorageKey, JSON.stringify(context));
  storage?.setItem(legacyStorageKey, normalizedToken);
}

export function readPendingClientJoinIntent(now = new Date()): PendingClientJoinIntent | null {
  const context = readStoredContext();
  if (!context) {
    return null;
  }
  if (new Date(context.expiresAt).getTime() <= now.getTime()) {
    clearClientJoinIntentToken();
    return null;
  }

  return context;
}

export function clearClientJoinIntentToken(): void {
  memoryContext = null;
  memoryToken = null;
  const storage = getSessionStorage();
  storage?.removeItem(contextStorageKey);
  storage?.removeItem(legacyStorageKey);
}

function readStoredContext(): PendingClientJoinIntent | null {
  const raw = getSessionStorage()?.getItem(contextStorageKey);
  if (!raw) {
    return memoryContext;
  }

  try {
    const parsed = JSON.parse(raw) as PendingClientJoinIntent;
    if (
      typeof parsed.token !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      typeof parsed.astrologer?.publicHandle !== "string" ||
      typeof parsed.astrologer?.publicName !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function getLegacyToken(): string | null {
  return getSessionStorage()?.getItem(legacyStorageKey) ?? memoryToken;
}

function getSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
