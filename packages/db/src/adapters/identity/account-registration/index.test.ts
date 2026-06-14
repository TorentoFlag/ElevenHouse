import type { AccountRegistrationUnitOfWork } from "@elevenhouse/domain";
import { describe, expect, it } from "vitest";
import { createDrizzleAccountRegistrationUnitOfWork } from "./index";
import type { AccountRegistrationDrizzleDatabase } from "./index";

describe("identity account-registration adapter exports", () => {
  it("creates a domain account registration unit of work", () => {
    const database = {
      transaction: async () => {
        throw new Error("not used");
      }
    } satisfies AccountRegistrationDrizzleDatabase;

    const unitOfWork: AccountRegistrationUnitOfWork =
      createDrizzleAccountRegistrationUnitOfWork(database);

    expect(unitOfWork).toHaveProperty("transact");
  });
});
