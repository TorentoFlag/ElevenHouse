import { createHash } from "node:crypto";

export type HumanDesignResultChecksum = {
  readonly algorithm: "sha256";
  readonly canonicalization: "json-stable-v1";
  readonly value: `sha256:${string}`;
};

export function createHumanDesignResultChecksum(payload: unknown): HumanDesignResultChecksum {
  const canonicalPayload = canonicalizeHumanDesignChecksumPayload(payload);
  const digest = createHash("sha256").update(canonicalPayload).digest("hex");
  return {
    algorithm: "sha256",
    canonicalization: "json-stable-v1",
    value: `sha256:${digest}`
  };
}

export function canonicalizeHumanDesignChecksumPayload(payload: unknown): string {
  return JSON.stringify(normalizeChecksumPayload(payload));
}

function normalizeChecksumPayload(payload: unknown): unknown {
  if (payload === null) return null;
  if (typeof payload === "string" || typeof payload === "boolean") return payload;
  if (typeof payload === "number") {
    if (!Number.isFinite(payload)) {
      throw new Error("Human Design checksum payload number must be finite");
    }
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeChecksumPayload(item));
  }
  if (typeof payload === "object") {
    return Object.fromEntries(
      Object.entries(payload)
        .filter(([key]) => key !== "resultChecksum")
        .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
        .map(([key, value]) => [key, normalizeChecksumPayload(value)])
    );
  }
  throw new Error(`Unsupported Human Design checksum payload value: ${typeof payload}`);
}
