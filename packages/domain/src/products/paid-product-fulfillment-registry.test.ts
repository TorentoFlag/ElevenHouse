import { describe, expect, it } from "vitest";
import {
  resolvePaidProductFulfillment,
  type PaidProductFulfillmentDependencyReader,
  type PaidProductFulfillmentDependencyStatus,
  type PaidProductFulfillmentShape
} from "./index";

const approvedPaidShape: PaidProductFulfillmentShape = {
  type: "single",
  paymentModel: "once",
  executionMode: "live",
  participantMode: "solo"
};

describe("paid product fulfillment registry", () => {
  it("resolves the approved live solo session to exact versioned booking authority", async () => {
    const decision = await resolvePaidProductFulfillment({
      product: approvedPaidShape,
      reader: createExactBookingDependencyReader()
    });

    expect(decision).toEqual({
      supported: true,
      registryKey: "single.once.live.solo",
      registryRevision: 1,
      holdAnchor: "booking_completed",
      terminalEvidence: {
        owner: "booking",
        status: "completed",
        contractVersion: 1
      },
      cancellationAllocator: {
        owner: "booking",
        port: "BookingCancellationRefundDecisionPort",
        policyVersion: 1
      }
    });
  });

  it("does not expose mutable registry records to callers", async () => {
    const decision = await resolvePaidProductFulfillment({
      product: approvedPaidShape,
      reader: createExactBookingDependencyReader()
    });

    expect(Object.isFrozen(decision)).toBe(true);
    if (decision.supported) {
      expect(Object.isFrozen(decision.terminalEvidence)).toBe(true);
      expect(Object.isFrozen(decision.cancellationAllocator)).toBe(true);
    }
  });

  it.each([
    ["missing terminal contract", "missing", "registered"],
    ["superseded terminal contract", "superseded", "registered"],
    ["missing cancellation policy", "registered", "missing"],
    ["superseded cancellation policy", "registered", "superseded"]
  ] as const)(
    "fails closed when the exact dependency is unavailable: %s",
    async (_caseName, terminalStatus, cancellationStatus) => {
      await expect(
        resolvePaidProductFulfillment({
          product: approvedPaidShape,
          reader: createExactBookingDependencyReader({
            terminalStatus,
            cancellationStatus
          })
        })
      ).resolves.toEqual({
        supported: false,
        code: "fulfillment_dependency_unavailable"
      });
    }
  );

  it("does not allow caller-supplied metadata or a fabricated policy to replace trusted dependencies", async () => {
    const untrustedInput = {
      product: {
        ...approvedPaidShape,
        label: "Booking completed",
        elapsedMinutes: 10_000,
        deliveryFormat: "video",
        frontendRoute: "/calendar",
        fulfillmentStatus: "completed"
      },
      reader: createExactBookingDependencyReader({ terminalStatus: "missing" }),
      cancellationAllocator: {
        owner: "booking",
        port: "BookingCancellationRefundDecisionPort",
        policyVersion: 1,
        refundPercent: 0
      }
    };

    await expect(resolvePaidProductFulfillment(untrustedInput)).resolves.toEqual({
      supported: false,
      code: "fulfillment_dependency_unavailable"
    });
  });

  it("bypasses the paid registry for free products without reading paid dependencies", async () => {
    const reader = createFailIfReadDependencyReader();

    await expect(
      resolvePaidProductFulfillment({
        product: {
          type: "custom",
          paymentModel: "free",
          executionMode: "instant",
          participantMode: "group"
        },
        reader
      })
    ).resolves.toEqual({
      supported: false,
      code: "free_product_fulfillment_not_required"
    });
  });

  it.each([
    [
      "session pack",
      { type: "pack", paymentModel: "pack", executionMode: "live", participantMode: "solo" },
      "session_pack_fulfillment_unsupported"
    ],
    [
      "client subscription",
      { type: "sub", paymentModel: "sub", executionMode: "async", participantMode: "solo" },
      "client_subscription_fulfillment_unsupported"
    ],
    [
      "pack payment model on an otherwise single session",
      { type: "single", paymentModel: "pack", executionMode: "live", participantMode: "solo" },
      "session_pack_fulfillment_unsupported"
    ],
    [
      "subscription payment model on an otherwise single session",
      { type: "single", paymentModel: "sub", executionMode: "live", participantMode: "solo" },
      "client_subscription_fulfillment_unsupported"
    ],
    [
      "group session",
      { type: "single", paymentModel: "once", executionMode: "live", participantMode: "group" },
      "group_fulfillment_unsupported"
    ],
    [
      "gift session",
      { type: "single", paymentModel: "once", executionMode: "live", participantMode: "gift" },
      "gift_fulfillment_unsupported"
    ],
    [
      "asynchronous delivery",
      { type: "async", paymentModel: "once", executionMode: "async", participantMode: "solo" },
      "asynchronous_fulfillment_unsupported"
    ],
    [
      "instant delivery",
      { type: "single", paymentModel: "once", executionMode: "instant", participantMode: "solo" },
      "instant_fulfillment_unsupported"
    ],
    [
      "mini product",
      { type: "mini", paymentModel: "once", executionMode: "instant", participantMode: "solo" },
      "mini_product_fulfillment_unsupported"
    ],
    [
      "course",
      { type: "course", paymentModel: "once", executionMode: "async", participantMode: "solo" },
      "course_product_fulfillment_unsupported"
    ],
    [
      "custom product",
      { type: "custom", paymentModel: "once", executionMode: "live", participantMode: "solo" },
      "custom_product_fulfillment_unsupported"
    ],
    [
      "unknown combination",
      { type: "unknown", paymentModel: "once", executionMode: "live", participantMode: "solo" },
      "paid_product_shape_unsupported"
    ]
  ] as const)("returns a stable unsupported code for %s", async (_caseName, product, code) => {
    await expect(
      resolvePaidProductFulfillment({
        product: product as PaidProductFulfillmentShape,
        reader: createFailIfReadDependencyReader()
      })
    ).resolves.toEqual({ supported: false, code });
  });
});

function createExactBookingDependencyReader(
  overrides: {
    readonly terminalStatus?: PaidProductFulfillmentDependencyStatus;
    readonly cancellationStatus?: PaidProductFulfillmentDependencyStatus;
  } = {}
): PaidProductFulfillmentDependencyReader {
  return {
    async getDependencyStatus(reference) {
      if (reference.kind === "terminal_evidence") {
        if (
          reference.owner !== "booking" ||
          reference.status !== "completed" ||
          reference.contractVersion !== 1
        ) {
          return "missing";
        }
        return overrides.terminalStatus ?? "registered";
      }

      if (
        reference.owner !== "booking" ||
        reference.port !== "BookingCancellationRefundDecisionPort" ||
        reference.policyVersion !== 1
      ) {
        return "missing";
      }
      return overrides.cancellationStatus ?? "registered";
    }
  };
}

function createFailIfReadDependencyReader(): PaidProductFulfillmentDependencyReader {
  return {
    async getDependencyStatus() {
      throw new Error("Paid fulfillment dependencies must not be read for this product shape");
    }
  };
}
