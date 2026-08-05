import type { CreatePayoutRequestCommand } from "@elevenhouse/domain/finance-core";
import { describe, expect, it } from "vitest";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  createDrizzlePayoutRequestUnitOfWork,
  PayoutRequestPersistenceError
} from "./drizzle-payout-request-uow";

describe("payout request persistence boundary", () => {
  it("rejects an incomplete command before it can open a database transaction", async () => {
    let transactions = 0;
    const database = {
      async transaction() {
        transactions += 1;
        throw new Error("must not open");
      }
    } as unknown as ElevenHouseDatabase;

    await expect(
      createDrizzlePayoutRequestUnitOfWork({ database }).createPayoutRequest(
        {} as CreatePayoutRequestCommand
      )
    ).rejects.toMatchObject({
      code: "payout_request_persistence_error",
      reason: "invalid_command"
    } satisfies Partial<PayoutRequestPersistenceError>);
    expect(transactions).toBe(0);
  });
});
