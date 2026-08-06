import { describe, expect, it } from "vitest";

import { financeEconomicPaymentIntegritySql } from "./economic-payments.schema";

describe("economic payment integrity SQL", () => {
  it("does not revalidate a stale created-intent deferred trigger after its checkout session is opened", () => {
    expect(financeEconomicPaymentIntegritySql).toContain(
      "current_intent.state <> 'created'"
    );
  });
});
