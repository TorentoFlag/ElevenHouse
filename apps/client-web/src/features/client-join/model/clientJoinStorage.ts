const storageKey = "elevenhouse.clientJoinIntentToken";

let memoryToken: string | null = null;

export function readClientJoinIntentToken(): string | null {
  return getSessionStorage()?.getItem(storageKey) ?? memoryToken;
}

export function writeClientJoinIntentToken(token: string): void {
  const normalized = token.trim();
  if (!normalized) {
    clearClientJoinIntentToken();
    return;
  }

  memoryToken = normalized;
  getSessionStorage()?.setItem(storageKey, normalized);
}

export function clearClientJoinIntentToken(): void {
  memoryToken = null;
  getSessionStorage()?.removeItem(storageKey);
}

function getSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
