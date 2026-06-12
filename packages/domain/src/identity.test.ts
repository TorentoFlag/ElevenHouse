import { describe, expect, it, vi } from "vitest";
import {
  createActiveUserAccount,
  grantCustomerRole,
  linkAuthIdentity,
  registerCustomerAccount,
  type AccountRegistrationUnitOfWork,
  type AccountRegistrationStore
} from "./index";

function createStore(): AccountRegistrationStore {
  return {
    createUser: vi.fn(async (input) => ({
      id: "user_1",
      status: input.status,
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z"
    })),
    createAuthIdentity: vi.fn(async (input) => ({
      id: "identity_1",
      userId: input.userId,
      provider: input.provider,
      providerSubject: input.providerSubject,
      email: input.email,
      phoneNumber: input.phoneNumber,
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z"
    })),
    assignRole: vi.fn(async (input) => ({
      id: `role_${input.role}`,
      userId: input.userId,
      role: input.role,
      assignedByUserId: input.assignedByUserId,
      assignedAt: "2026-06-12T00:00:00.000Z"
    }))
  };
}

describe("createActiveUserAccount", () => {
  it("creates a new active account through the registration store", async () => {
    const store = createStore();

    const user = await createActiveUserAccount({ store });

    expect(store.createUser).toHaveBeenCalledWith({ status: "active" });
    expect(user).toMatchObject({ id: "user_1", status: "active" });
  });
});

describe("linkAuthIdentity", () => {
  it("links an email identity to an existing account", async () => {
    const store = createStore();

    const identity = await linkAuthIdentity({
      store,
      userId: "user_1",
      identity: {
        provider: "email",
        providerSubject: "ada@example.com",
        email: "ada@example.com",
        passwordHash: "argon2$hash"
      }
    });

    expect(store.createAuthIdentity).toHaveBeenCalledWith({
      userId: "user_1",
      provider: "email",
      providerSubject: "ada@example.com",
      email: "ada@example.com",
      passwordHash: "argon2$hash"
    });
    expect(identity).toMatchObject({ provider: "email", email: "ada@example.com" });
  });

  it("trims email identity strings before linking", async () => {
    const store = createStore();

    await linkAuthIdentity({
      store,
      userId: "user_1",
      identity: {
        provider: "email",
        providerSubject: " ada@example.com ",
        email: " ada@example.com ",
        passwordHash: "argon2$hash"
      }
    });

    expect(store.createAuthIdentity).toHaveBeenCalledWith({
      userId: "user_1",
      provider: "email",
      providerSubject: "ada@example.com",
      email: "ada@example.com",
      passwordHash: "argon2$hash"
    });
  });

  it("rejects an email identity without a non-empty email address", async () => {
    const store = createStore();

    await expect(
      linkAuthIdentity({
        store,
        userId: "user_1",
        identity: {
          provider: "email",
          providerSubject: "ada@example.com",
          email: "   ",
          passwordHash: "argon2$hash"
        }
      })
    ).rejects.toThrow("Email identities require an email address");

    expect(store.createAuthIdentity).not.toHaveBeenCalled();
  });

  it("rejects an email identity without a non-empty password hash", async () => {
    const store = createStore();

    await expect(
      linkAuthIdentity({
        store,
        userId: "user_1",
        identity: {
          provider: "email",
          providerSubject: "ada@example.com",
          email: "ada@example.com",
          passwordHash: "   "
        }
      })
    ).rejects.toThrow("Email identities require a password hash");

    expect(store.createAuthIdentity).not.toHaveBeenCalled();
  });

  it("rejects a phone identity without a non-empty phone number", async () => {
    const store = createStore();

    await expect(
      linkAuthIdentity({
        store,
        userId: "user_1",
        identity: {
          provider: "phone",
          providerSubject: "+15550001111",
          phoneNumber: "   "
        }
      })
    ).rejects.toThrow("Phone identities require a phone number");

    expect(store.createAuthIdentity).not.toHaveBeenCalled();
  });
});

describe("grantCustomerRole", () => {
  it("grants customer-facing roles", async () => {
    const store = createStore();

    const assignment = await grantCustomerRole({
      store,
      userId: "user_1",
      role: "astrologer",
      assignedByUserId: "admin_1"
    });

    expect(store.assignRole).toHaveBeenCalledWith({
      userId: "user_1",
      role: "astrologer",
      assignedByUserId: "admin_1"
    });
    expect(assignment).toMatchObject({ role: "astrologer" });
  });

  it("rejects internal platform roles", async () => {
    const store = createStore();

    await expect(
      grantCustomerRole({
        store,
        userId: "user_1",
        role: "admin"
      })
    ).rejects.toThrow("Customer registration cannot assign internal role: admin");

    expect(store.assignRole).not.toHaveBeenCalled();
  });
});

describe("registerCustomerAccount", () => {
  it("creates an active account, links identity and assigns unique customer roles in one unit of work", async () => {
    const store = createStore();
    let transactCalls = 0;
    const accountRegistration: AccountRegistrationUnitOfWork = {
      transact: async (operation) => {
        transactCalls += 1;
        return operation(store);
      }
    };

    const result = await registerCustomerAccount({
      accountRegistration,
      identity: {
        provider: "email",
        providerSubject: "ada@example.com",
        email: "ada@example.com",
        passwordHash: "argon2$hash"
      },
      roles: ["client", "client", "astrologer"]
    });

    expect(transactCalls).toBe(1);
    expect(store.createUser).toHaveBeenCalledWith({ status: "active" });
    expect(store.createAuthIdentity).toHaveBeenCalledWith({
      userId: "user_1",
      provider: "email",
      providerSubject: "ada@example.com",
      email: "ada@example.com",
      passwordHash: "argon2$hash"
    });
    expect(store.assignRole).toHaveBeenCalledTimes(2);
    expect(result.roleAssignments.map((assignment) => assignment.role)).toEqual([
      "client",
      "astrologer"
    ]);
  });

  it("requires at least one customer role", async () => {
    const store = createStore();
    let transactCalls = 0;
    const accountRegistration: AccountRegistrationUnitOfWork = {
      transact: async (operation) => {
        transactCalls += 1;
        return operation(store);
      }
    };

    await expect(
      registerCustomerAccount({
        accountRegistration,
        identity: {
          provider: "email",
          providerSubject: "ada@example.com",
          email: "ada@example.com"
        },
        roles: []
      })
    ).rejects.toThrow("Customer registration requires at least one role");

    expect(transactCalls).toBe(0);
    expect(store.createUser).not.toHaveBeenCalled();
  });
});
