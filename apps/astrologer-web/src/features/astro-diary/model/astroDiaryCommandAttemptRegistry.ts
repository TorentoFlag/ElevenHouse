export type AstroDiaryCommandScope = "save" | "publish";

export function createAstroDiaryCommandAttemptRegistry(
  createRequestId: () => string = () => crypto.randomUUID()
) {
  const attempts = new Map<AstroDiaryCommandScope, Map<string, string>>();

  return {
    acquire(scope: AstroDiaryCommandScope, payload: unknown): string {
      const signature = stableJson(payload);
      const scopedAttempts = attempts.get(scope) ?? new Map<string, string>();
      const current = scopedAttempts.get(signature);
      if (current) return current;

      const key = `astro-diary:${scope}:${createRequestId()}`;
      scopedAttempts.set(signature, key);
      attempts.set(scope, scopedAttempts);
      return key;
    },
    acknowledge(scope: AstroDiaryCommandScope, idempotencyKey: string): void {
      const scopedAttempts = attempts.get(scope);
      if (!scopedAttempts) return;
      for (const [signature, currentKey] of scopedAttempts) {
        if (currentKey !== idempotencyKey) continue;
        scopedAttempts.delete(signature);
        break;
      }
      if (scopedAttempts.size === 0) attempts.delete(scope);
    }
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)])
  );
}
