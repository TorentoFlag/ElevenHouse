import type { Product } from "@elevenhouse/domain";
import { describe, expect, it } from "vitest";
import { toBookingProduct } from "./booking.module";

const product: Product = {
  id: "11111111-1111-4111-8111-111111111111",
  revision: 1,
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  type: "single",
  status: "active",
  title: "Natal reading",
  subtitle: null,
  priceMinor: 50_000,
  currency: "RUB",
  coverMediaId: null,
  introVideoUrl: null,
  executionMode: "live",
  paymentModel: "once",
  durationMinutes: 60,
  durationLabel: null,
  slaLabel: null,
  packageSessionCount: null,
  packageDiscountPercent: null,
  subscriptionPeriod: null,
  trialDays: null,
  participantMode: "solo",
  groupSize: null,
  deliveryFormats: ["video"],
  requiredClientData: ["chart1"],
  methods: ["natal"],
  accessGrants: [],
  includedItems: [],
  modifiers: [],
  astroDiaryConfig: null,
  createdAt: "2026-08-07T00:00:00.000Z",
  updatedAt: "2026-08-07T00:00:00.000Z"
};

describe("public booking product mapper", () => {
  it("preserves client-data requirements needed for the immutable booking snapshot", () => {
    expect(toBookingProduct(product)).toMatchObject({
      requiredClientData: ["chart1"],
      methods: ["natal"]
    });
  });
});
