import type { AccountRegistrationStore, AccountRegistrationUnitOfWork } from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import {
  DomainCustomerAccountRegistrationHandler,
  type PasswordHasher
} from "./identity-registration.handler";

function createAccountRegistrationUnitOfWork() {
  const store: AccountRegistrationStore = {
    createUser: vi.fn(async (input) => ({
      id: "8e14390f-3db1-4d1c-9344-55679c778427",
      status: input.status,
      createdAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z"
    })),
    createAuthIdentity: vi.fn(async (input) => ({
      id: "identity_1",
      userId: input.userId,
      provider: input.provider,
      providerSubject: input.providerSubject,
      email: input.email,
      createdAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z"
    })),
    assignRole: vi.fn(async (input) => ({
      id: `role_${input.role}`,
      userId: input.userId,
      role: input.role,
      assignedAt: "2026-06-14T00:00:00.000Z"
    }))
  };
  const accountRegistration: AccountRegistrationUnitOfWork = {
    transact: async (operation) => operation(store)
  };

  return { accountRegistration, store };
}

describe("DomainCustomerAccountRegistrationHandler", () => {
  it("hashes the password, registers the account through the domain use case and returns an API response", async () => {
    const { accountRegistration, store } = createAccountRegistrationUnitOfWork();
    const passwordHasher: PasswordHasher = {
      hashPassword: vi.fn(async () => "argon2id$hash")
    };
    const handler = new DomainCustomerAccountRegistrationHandler(
      accountRegistration,
      passwordHasher
    );

    const response = await handler.registerCustomerAccount({
      email: "client@example.com",
      password: "correct-horse-battery-staple",
      roles: ["client", "astrologer"]
    });

    expect(passwordHasher.hashPassword).toHaveBeenCalledWith("correct-horse-battery-staple");
    expect(store.createAuthIdentity).toHaveBeenCalledWith({
      userId: "8e14390f-3db1-4d1c-9344-55679c778427",
      provider: "email",
      providerSubject: "client@example.com",
      email: "client@example.com",
      passwordHash: "argon2id$hash"
    });
    expect(response).toEqual({
      account: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        roles: ["client", "astrologer"]
      }
    });
  });
});
