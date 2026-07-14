import { createHash } from "node:crypto";

export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJson[]
  | { readonly [key: string]: CanonicalJson };

export function sha256CanonicalJson(value: CanonicalJson): `sha256:${string}` {
  const hex = createHash("sha256").update(stableJson(value), "utf8").digest("hex");
  return `sha256:${hex}`;
}

export function stableJson(value: CanonicalJson): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON numbers must be finite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as { readonly [key: string]: CanonicalJson };
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key]!)}`)
    .join(",")}}`;
}
