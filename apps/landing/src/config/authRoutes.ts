const DEFAULT_ASTROLOGER_WEB_ORIGIN = "http://localhost:5174";

export type AuthMode = "login" | "register";

export function createAuthHref(mode: AuthMode, origin = resolveAstrologerWebOrigin()) {
  return `${normalizeOrigin(origin)}/auth?mode=${mode}`;
}

function resolveAstrologerWebOrigin() {
  const origin = import.meta.env.VITE_ASTROLOGER_WEB_ORIGIN?.trim();
  return origin || DEFAULT_ASTROLOGER_WEB_ORIGIN;
}

function normalizeOrigin(origin: string) {
  return origin.replace(/\/+$/, "");
}
