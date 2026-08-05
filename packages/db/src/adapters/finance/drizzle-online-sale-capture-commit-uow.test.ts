import { describe, expect, it } from "vitest";

import {
  classifyOnlineSaleCapturePostgresFailure,
  createDrizzleOnlineSaleCaptureCommitUnitOfWork,
  OnlineSaleCaptureCommitPersistenceError
} from "./drizzle-online-sale-capture-commit-uow";

describe("v2 online sale-capture commit admission", () => {
  it("fails closed when the command is not the distinct v2 admission object", async () => {
    const unitOfWork = createDrizzleOnlineSaleCaptureCommitUnitOfWork({
      database: { transaction: async (callback: (transaction: object) => unknown) => callback({}) }
    } as never);

    await expect(unitOfWork.commitOnlineSaleCapture({} as never)).rejects.toBeInstanceOf(
      OnlineSaleCaptureCommitPersistenceError
    );
  });

  it.each([
    ["40001", "retryable_concurrency_conflict"],
    ["40P01", "retryable_concurrency_conflict"],
    ["23505", "capture_replay_conflict"],
    ["23503", "persistence_write_incomplete"],
    ["23514", "persistence_write_incomplete"],
    ["55000", "persistence_write_incomplete"]
  ] as const)("classifies PostgreSQL %s as %s", async (code, reason) => {
    const thrown = new Error("driver wrapper", {
      cause: Object.assign(new Error("postgres"), { code })
    });
    expect(classifyOnlineSaleCapturePostgresFailure(thrown)).toBe(reason);
  });

  it("does not mislabel an unclassified driver failure as a replay", () => {
    expect(classifyOnlineSaleCapturePostgresFailure(new Error("connection reset"))).toBeNull();
  });
});
