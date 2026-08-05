import { describe, expect, it } from "vitest";

import {
  CashPoolDirectoryBootstrapPersistenceError,
  normalizeEnsureEmptySystemCashPoolReferenceCommand
} from "./drizzle-cash-pool-directory-bootstrap";

const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("empty cash-pool directory bootstrap", () => {
  it("accepts only a canonical RUB reference identity", () => {
    expect(
      normalizeEnsureEmptySystemCashPoolReferenceCommand({
        bankCashPoolId: "elevenhouse-rub-main",
        currency: "RUB",
        bankAccountFingerprint: digest,
        statementSourceFingerprint: digest
      } as never)
    ).toEqual({
      bankCashPoolId: "elevenhouse-rub-main",
      currency: "RUB",
      bankAccountFingerprint: digest,
      statementSourceFingerprint: digest
    });
  });

  it("rejects a non-RUB or malformed identity before opening PostgreSQL", () => {
    expect(() =>
      normalizeEnsureEmptySystemCashPoolReferenceCommand({
        bankCashPoolId: " elevenhouse-rub-main",
        currency: "USD",
        bankAccountFingerprint: digest,
        statementSourceFingerprint: digest
      } as never)
    ).toThrow(
      expect.objectContaining<Partial<CashPoolDirectoryBootstrapPersistenceError>>({
        reason: "invalid_command"
      })
    );
  });

  it("rejects a proxy without executing its traps", () => {
    let trapCalls = 0;
    const proxy = new Proxy(
      {
        bankCashPoolId: "elevenhouse-rub-main",
        currency: "RUB",
        bankAccountFingerprint: digest,
        statementSourceFingerprint: digest
      },
      {
        ownKeys: () => {
          trapCalls += 1;
          return [];
        }
      }
    );

    expect(() => normalizeEnsureEmptySystemCashPoolReferenceCommand(proxy as never)).toThrow(
      CashPoolDirectoryBootstrapPersistenceError
    );
    expect(trapCalls).toBe(0);
  });
});
