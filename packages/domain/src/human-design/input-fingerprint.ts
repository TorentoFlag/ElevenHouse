import { createHash } from "node:crypto";
import type { BuildHumanDesignActivationsInput } from "./activations";
import {
  HUMAN_DESIGN_ENGINE_REVISION,
  HUMAN_DESIGN_METHOD_CODE,
  HUMAN_DESIGN_SCHEMA_VERSION
} from "./human-design-types";
import { canonicalizeHumanDesignChecksumPayload } from "./result-checksum";

export type HumanDesignResolvedInputFingerprint = {
  readonly algorithm: "sha256";
  readonly canonicalization: "json-stable-v1";
  readonly scope: "human-design-individual-resolved-input.v1";
  readonly value: `sha256:${string}`;
};

export function createHumanDesignResolvedInputFingerprint(
  input: BuildHumanDesignActivationsInput
): HumanDesignResolvedInputFingerprint {
  const canonicalPayload = canonicalizeHumanDesignChecksumPayload(
    buildHumanDesignResolvedInputFingerprintPayload(input)
  );
  const digest = createHash("sha256").update(canonicalPayload).digest("hex");
  return {
    algorithm: "sha256",
    canonicalization: "json-stable-v1",
    scope: "human-design-individual-resolved-input.v1",
    value: `sha256:${digest}`
  };
}

export function buildHumanDesignResolvedInputFingerprintPayload(
  input: BuildHumanDesignActivationsInput
): {
  readonly methodCode: typeof HUMAN_DESIGN_METHOD_CODE;
  readonly engineRevision: typeof HUMAN_DESIGN_ENGINE_REVISION;
  readonly schemaVersion: typeof HUMAN_DESIGN_SCHEMA_VERSION;
  readonly mode: "individual";
  readonly resolvedLongitudes: BuildHumanDesignActivationsInput;
} {
  return {
    methodCode: HUMAN_DESIGN_METHOD_CODE,
    engineRevision: HUMAN_DESIGN_ENGINE_REVISION,
    schemaVersion: HUMAN_DESIGN_SCHEMA_VERSION,
    mode: "individual",
    resolvedLongitudes: input
  };
}
