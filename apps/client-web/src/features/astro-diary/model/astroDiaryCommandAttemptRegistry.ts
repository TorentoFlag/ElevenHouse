export type AstroDiaryCommandScope = "save" | "publish";

export function createAstroDiaryCommandAttemptRegistry(
  createRequestId: () => string = () => crypto.randomUUID()
) {
  const attempts = new Map<AstroDiaryCommandScope, Map<string, string>>();
  return {
    acquire(scope: AstroDiaryCommandScope, payload: unknown): string {
      const signature = JSON.stringify(canonicalize(payload));
      const scoped = attempts.get(scope) ?? new Map<string, string>();
      const current = scoped.get(signature);
      if (current) return current;
      const key = `astro-diary:${scope}:${createRequestId()}`;
      scoped.set(signature, key);
      attempts.set(scope, scoped);
      return key;
    },
    acknowledge(scope: AstroDiaryCommandScope, idempotencyKey: string): void {
      const scoped = attempts.get(scope);
      if (!scoped) return;
      for (const [signature, key] of scoped) {
        if (key !== idempotencyKey) continue;
        scoped.delete(signature);
        break;
      }
      if (scoped.size === 0) attempts.delete(scope);
    }
  };
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
