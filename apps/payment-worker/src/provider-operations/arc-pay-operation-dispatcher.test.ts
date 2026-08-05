import type { ProviderOperationDispatchWorkItem } from "@elevenhouse/domain/finance-core";
import { describe, expect, it, vi } from "vitest";

import { createArcPayOperationDispatcher } from "./arc-pay-operation-dispatcher";

describe("ArcPay operation dispatcher", () => {
  it("routes each currently implemented operation to its dedicated semantic dispatcher", async () => {
    const checkout = { dispatch: vi.fn(async () => undefined) };
    const cardSetup = { dispatch: vi.fn(async () => undefined) };
    const cardSetupExecute = { dispatch: vi.fn(async () => undefined) };
    const cardSetupThreeDsMethod = { dispatch: vi.fn(async () => undefined) };
    const savedCardCharge = { dispatch: vi.fn(async () => undefined) };
    const savedCardChargeThreeDsMethod = { dispatch: vi.fn(async () => undefined) };
    const refund = { dispatch: vi.fn(async () => undefined) };
    const dispatcher = createArcPayOperationDispatcher({ checkout, cardSetup, cardSetupExecute, cardSetupThreeDsMethod, savedCardCharge, savedCardChargeThreeDsMethod, refund });

    await dispatcher.dispatch({ operationKind: "checkout_session_create" } as ProviderOperationDispatchWorkItem);
    await dispatcher.dispatch({ operationKind: "card_setup" } as ProviderOperationDispatchWorkItem);
    await dispatcher.dispatch({ operationKind: "card_setup_execute" } as ProviderOperationDispatchWorkItem);
    await dispatcher.dispatch({ operationKind: "card_setup_3ds_method_complete" } as ProviderOperationDispatchWorkItem);
    await dispatcher.dispatch({ operationKind: "saved_card_charge" } as ProviderOperationDispatchWorkItem);
    await dispatcher.dispatch({ operationKind: "saved_card_charge_3ds_method_complete" } as ProviderOperationDispatchWorkItem);
    await dispatcher.dispatch({ operationKind: "refund" } as ProviderOperationDispatchWorkItem);

    expect(checkout.dispatch).toHaveBeenCalledTimes(1);
    expect(cardSetup.dispatch).toHaveBeenCalledTimes(1);
    expect(cardSetupExecute.dispatch).toHaveBeenCalledTimes(1);
    expect(cardSetupThreeDsMethod.dispatch).toHaveBeenCalledTimes(1);
    expect(savedCardCharge.dispatch).toHaveBeenCalledTimes(1);
    expect(savedCardChargeThreeDsMethod.dispatch).toHaveBeenCalledTimes(1);
    expect(refund.dispatch).toHaveBeenCalledTimes(1);
  });

  it("rejects a persisted operation that does not have a safe dispatcher yet", async () => {
    const dispatcher = createArcPayOperationDispatcher({
      checkout: { dispatch: vi.fn() },
      cardSetup: { dispatch: vi.fn() },
      cardSetupExecute: { dispatch: vi.fn() },
      cardSetupThreeDsMethod: { dispatch: vi.fn() },
      savedCardCharge: { dispatch: vi.fn() },
      savedCardChargeThreeDsMethod: { dispatch: vi.fn() },
      refund: { dispatch: vi.fn() }
    });

    await expect(
      dispatcher.dispatch({ operationKind: "void" } as ProviderOperationDispatchWorkItem)
    ).rejects.toMatchObject({ reason: "unsupported_operation" });
  });
});
