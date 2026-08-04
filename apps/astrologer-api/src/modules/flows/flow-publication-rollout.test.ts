import { describe, expect, it } from "vitest";

import {
  selectFlowPublicationVersions,
  selectFlowValidationResponseVersion
} from "./flow-publication-rollout";

describe("Flow publication rollout policy", () => {
  it("keeps both persistence and wire responses legacy before the fleet gate opens", () => {
    const policy = { phase: "legacy_v1" } as const;

    expect(selectFlowValidationResponseVersion(policy, "current_v2")).toBe("legacy_v1");
    expect(selectFlowPublicationVersions(policy, "current_v3")).toEqual({
      persistenceVersion: "legacy_v1",
      responseVersion: "legacy_v2"
    });
  });

  it("enables V2 persistence while preserving legacy wire compatibility by default", () => {
    const policy = { phase: "manifest_v2" } as const;

    expect(selectFlowValidationResponseVersion(policy, "legacy_v1")).toBe("legacy_v1");
    expect(selectFlowPublicationVersions(policy, "legacy_v2")).toEqual({
      persistenceVersion: "current_v2",
      responseVersion: "legacy_v2"
    });
  });

  it("serves current wire contracts only after both phase and Accept opt in", () => {
    const policy = { phase: "manifest_v2" } as const;

    expect(selectFlowValidationResponseVersion(policy, "current_v2")).toBe("current_v2");
    expect(selectFlowPublicationVersions(policy, "current_v3")).toEqual({
      persistenceVersion: "current_v2",
      responseVersion: "current_v3"
    });
  });
});
