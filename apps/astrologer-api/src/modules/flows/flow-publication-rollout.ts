import type { FlowPublicationPersistenceVersion } from "@elevenhouse/domain";

import type {
  FlowPublicationResponseVersion,
  FlowValidationResponseVersion
} from "./flow-response-negotiation";

export const flowPublicationRolloutPhaseValues = ["legacy_v1", "manifest_v2"] as const;
export type FlowPublicationRolloutPhase = (typeof flowPublicationRolloutPhaseValues)[number];

export type FlowPublicationRolloutPolicy = {
  readonly phase: FlowPublicationRolloutPhase;
};

export function selectFlowValidationResponseVersion(
  policy: FlowPublicationRolloutPolicy,
  requested: FlowValidationResponseVersion
): FlowValidationResponseVersion {
  return policy.phase === "manifest_v2" ? requested : "legacy_v1";
}

export function selectFlowPublicationVersions(
  policy: FlowPublicationRolloutPolicy,
  requested: FlowPublicationResponseVersion
): {
  readonly persistenceVersion: FlowPublicationPersistenceVersion;
  readonly responseVersion: FlowPublicationResponseVersion;
} {
  return policy.phase === "manifest_v2"
    ? { persistenceVersion: "current_v2", responseVersion: requested }
    : { persistenceVersion: "legacy_v1", responseVersion: "legacy_v2" };
}
