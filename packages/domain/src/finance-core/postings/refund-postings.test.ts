import { describe, expect, it } from "vitest";
import { buildRefundApprovedPosting } from "./refund-approved-posting";
import { buildRefundBridgePayoutFailedPosting } from "./refund-bridge-failed-posting";
import { buildRefundBridgePayoutPaidPosting } from "./refund-bridge-paid-posting";
import { buildRefundConfirmedPosting, buildRefundFailedPosting } from "./refund-terminal-posting";
import * as facade from "./refund-postings";

describe("refund posting facade", () => {
  it("exposes only the slice-owned refund posting builders", () => {
    expect(facade.buildRefundApprovedPosting).toBe(buildRefundApprovedPosting);
    expect(facade.buildRefundConfirmedPosting).toBe(buildRefundConfirmedPosting);
    expect(facade.buildRefundFailedPosting).toBe(buildRefundFailedPosting);
    expect(facade.buildRefundBridgePayoutFailedPosting).toBe(buildRefundBridgePayoutFailedPosting);
    expect(facade.buildRefundBridgePayoutPaidPosting).toBe(buildRefundBridgePayoutPaidPosting);
  });
});
