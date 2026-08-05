import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  FinanceEconomicPaymentCaptureAppliedPayload,
  FinancePlatformTariffInvoiceChargePreparationRequestedPayload,
  FinanceProviderOperationDispatchRequestedPayload,
  FinanceSavedCardSetupPreparationRequestedPayload
} from "@elevenhouse/domain/finance-core";
import type { BookingLifecycleDispatchRequestedPayload } from "@elevenhouse/domain";

import { outboxEvents, type OutboxEventPayload } from "./outbox-events.schema";

describe("finance outbox schema contract", () => {
  it("admits the IDs-only finance dispatch payload and enforces it in PostgreSQL", () => {
    const payload: FinanceProviderOperationDispatchRequestedPayload = {
      providerOperationIntentId: "98d6f782-725d-497d-a4ef-6ddfa3f6920a"
    };
    expectTypeOf(payload).toMatchTypeOf<OutboxEventPayload>();

    const checks = getTableConfig(outboxEvents).checks.map((check) => check.name);
    expect(checks).toContain("outbox_events_finance_dispatch_payload_check");
  });

  it("admits the IDs-only capture receipt payload and enforces aggregate equality", () => {
    const payload: FinanceEconomicPaymentCaptureAppliedPayload = {
      captureApplicationReceiptId: "1581785f-a4fd-4d06-9b9e-e172ab6a1b70"
    };
    expectTypeOf(payload).toMatchTypeOf<OutboxEventPayload>();

    const checks = getTableConfig(outboxEvents).checks.map((check) => check.name);
    expect(checks).toContain("outbox_events_finance_capture_payload_check");
  });

  it("admits the IDs-only saved-card setup preparation payload", () => {
    const payload: FinanceSavedCardSetupPreparationRequestedPayload = {
      setupSessionId: "6cbf64fe-633c-4fb0-af8d-d996b9976453"
    };
    expectTypeOf(payload).toMatchTypeOf<OutboxEventPayload>();
    expect(getTableConfig(outboxEvents).checks.map((check) => check.name))
      .toContain("outbox_events_finance_saved_card_setup_preparation_payload_check");
  });

  it("admits only the initial tariff-invoice preparation-request ID", () => {
    const payload: FinancePlatformTariffInvoiceChargePreparationRequestedPayload = {
      preparationRequestId: "b14b1c5b-37bc-41b5-bcb4-31f0b8565614"
    };
    expectTypeOf(payload).toMatchTypeOf<OutboxEventPayload>();
    expect(getTableConfig(outboxEvents).checks.map((check) => check.name))
      .toContain("outbox_events_finance_platform_tariff_invoice_charge_preparation_payload_check");
  });
});

describe("booking lifecycle outbox schema contract", () => {
  it("admits only the immutable lifecycle event ID and enforces aggregate equality", () => {
    const payload: BookingLifecycleDispatchRequestedPayload = {
      schemaVersion: "booking-lifecycle-event-dispatch-request.v1",
      lifecycleEventId: "11111111-1111-4111-8111-111111111111"
    };
    expectTypeOf(payload).toMatchTypeOf<OutboxEventPayload>();
    expect(getTableConfig(outboxEvents).checks.map((check) => check.name)).toContain(
      "outbox_events_booking_lifecycle_dispatch_payload_check"
    );
  });
});
