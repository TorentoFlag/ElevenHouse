import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workerSource = readFileSync("apps/workers/src/main.ts", "utf8");
const flowAdapterIndex = readFileSync("packages/db/src/adapters/flows/index.ts", "utf8");

describe("Flow enrollment control worker wiring", () => {
  it("runs bounded enrollment outcome retention from the worker maintenance lifecycle", () => {
    expect(flowAdapterIndex).toContain(
      'export * from "./drizzle-flow-enrollment-control-retention-store"'
    );
    expect(workerSource).toContain("runFlowEnrollmentControlOutcomeRetention");
    expect(workerSource).toContain("enrollmentCommandOutcomesPurged");
  });

  it("wires authoritative booking enrollment through the fenced worker lifecycle", () => {
    expect(flowAdapterIndex).toContain(
      'export * from "./drizzle-flow-booking-enrollment-store"'
    );
    expect(workerSource).toContain("createDrizzleFlowBookingEnrollmentStore(");
    expect(workerSource).toContain("postgres.database,\n  flowWorkerIdentity");
    expect(workerSource).toContain("if (!flowWorkerControl?.isClaimingAllowed()) return;");
    expect(workerSource).toContain("enrollBookingConfirmed: (request) =>");
    expect(workerSource).toContain("config.flowBookingEnrollment.latenessHorizonMs");
    expect(workerSource).toContain("config.flowBookingEnrollment.futureSkewToleranceMs");
    expect(workerSource).toContain("config.flowBookingEnrollment.deferDelayMs");
  });

  it("registers one worker session for enrollment and execution requirements", () => {
    expect(workerSource).toContain('roles: ["enrollment", "executor"]');
    expect(workerSource).toContain("createFlowBookingEnrollmentWorkerRequirementKeys()");
    expect(workerSource).toContain(
      "createFlowExecutionWorkerRequirementKeys(flowNodeExecutorRegistry.executorKeys)"
    );
  });
});
