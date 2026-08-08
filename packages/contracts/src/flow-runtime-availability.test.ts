import { describe, expect, it } from "vitest";

import { flowRuntimeAvailabilitySchema } from "./flows";

describe("flow runtime availability contract", () => {
  it("keeps a rollout-enabled but operationally unavailable runtime explicit", () => {
    expect(
      flowRuntimeAvailabilitySchema.parse({
        mode: "enabled",
        executionAvailable: false,
        reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
        historySemantics: "durable_execution"
      })
    ).toMatchObject({ mode: "enabled", executionAvailable: false });
  });
});
