import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { chargebackResolutionAllocationFixture } from "./chargeback-resolution-allocation-test-fixture";

export function chargebackResolutionProviderConfirmationChain(
  allocation: ReturnType<typeof chargebackResolutionAllocationFixture>
) {
  return Object.freeze([
    Object.freeze({
      providerEvidenceBinding: allocation.allocationAuthority.confirmedProviderEvidenceBinding,
      operationReceipt: allocation.base.providerConfirmationOperationReceipt,
      componentBindings: allocation.base.providerConfirmationComponentBindings
    })
  ]);
}

export function rehashResolutionAuthority<T extends Record<string, unknown>>(input: T) {
  const core = { ...input };
  Reflect.deleteProperty(core, "canonicalDigest");
  return Object.freeze({ ...core, canonicalDigest: hashFinanceCommandPayload(core) }) as Readonly<
    T & { canonicalDigest: `sha256:${string}` }
  >;
}
