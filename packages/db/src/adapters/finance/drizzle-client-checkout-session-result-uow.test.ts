import { describe, expect, it, vi } from "vitest";

import { createDrizzleClientCheckoutSessionResultUnitOfWork } from "./drizzle-client-checkout-session-result-uow";
import { publishClientCheckoutReadyInTransaction } from "./drizzle-client-checkout-preparation-store";

describe("createDrizzleClientCheckoutSessionResultUnitOfWork", () => {
  it("accepts an ArcPay UUIDv7 hosted checkout identifier before entering the transaction", async () => {
    const receipt = { kind: "client_checkout_session_result_commit_receipt" };
    const database = {
      transaction: vi.fn(async () => receipt)
    };
    const unitOfWork = createDrizzleClientCheckoutSessionResultUnitOfWork(database as never);

    await expect(
      unitOfWork.completeClientCheckoutSession({
        providerResult: {
          providerOperationIntentId: "checkout-operation-1"
        },
        providerCheckoutId: "019fd91e-4ac6-7e0f-a536-4d8b10782d51",
        responseArtifactId: "arc-hpp-session-response:checkout-operation-1",
        responseArtifactDigest:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      } as never)
    ).resolves.toEqual(receipt);

    expect(database.transaction).toHaveBeenCalledTimes(1);
  });

  it("accepts the numeric expectedVersion specified by the checkout worker port", async () => {
    const transaction = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: () => ({
              for: async () => []
            })
          })
        })
      }))
    };

    await expect(
      publishClientCheckoutReadyInTransaction(transaction as never, {
        checkoutPreparationId: "11111111-1111-4111-8111-111111111111",
        providerOperationIntentId: "22222222-2222-4222-8222-222222222222",
        expectedVersion: 1,
        providerCheckoutId: "019fd91e-4ac6-7e0f-a536-4d8b10782d51",
        responseArtifactId: "arc-hpp-session-response:checkout-operation-1",
        responseArtifactDigest:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      })
    ).rejects.toMatchObject({ reason: "checkout_preparation_not_found" });
  });
});
