import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  mobileRefreshTokens,
  mobileRefreshRetryReceipts,
  mobileSessionIntegritySql,
  mobileSessions
} from "./mobile-sessions.schema";

describe("mobile session identity schema", () => {
  it("enforces strict local session and refresh-token lifecycle checks", () => {
    const sessionChecks = getTableConfig(mobileSessions).checks.map((item) => item.name);
    const refreshChecks = getTableConfig(mobileRefreshTokens).checks.map((item) => item.name);
    const receiptChecks = getTableConfig(mobileRefreshRetryReceipts).checks.map((item) => item.name);

    expect(sessionChecks).toEqual(
      expect.arrayContaining([
        "mobile_sessions_device_label_check",
        "mobile_sessions_access_token_hash_check",
        "mobile_sessions_timestamp_order_check",
        "mobile_sessions_lifecycle_check"
      ])
    );
    expect(refreshChecks).toEqual(
      expect.arrayContaining([
        "mobile_refresh_tokens_token_hash_check",
        "mobile_refresh_tokens_timestamp_order_check",
        "mobile_refresh_tokens_lifecycle_check"
      ])
    );
    expect(receiptChecks).toEqual(
      expect.arrayContaining([
        "mobile_refresh_retry_receipts_timestamp_order_check",
        "mobile_refresh_retry_receipts_ciphertext_check"
      ])
    );
  });

  it("defines commit-time family integrity and immutable terminal transitions", () => {
    expect(mobileSessionIntegritySql).toContain("deferrable initially deferred");
    expect(mobileSessionIntegritySql).toContain("mobile_validate_session_family");
    expect(mobileSessionIntegritySql).toContain("mobile_guard_session_mutation");
    expect(mobileSessionIntegritySql).toContain("mobile_guard_refresh_token_mutation");
    expect(mobileSessionIntegritySql).toContain("for update");
  });
});
