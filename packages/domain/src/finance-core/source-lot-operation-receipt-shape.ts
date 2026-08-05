import type {
  PayableLotHistoryRecord,
  PayableLotOperationAuthority,
  PayableSourceLot
} from "./source-lot-types";
import { fail } from "./source-lot-validation";

export function assertOperationShape(
  record: PayableLotHistoryRecord,
  consumed: readonly PayableSourceLot[],
  created: readonly PayableSourceLot[]
): void {
  const noAuxiliary = (
    options: {
      readonly refundOrigins?: boolean;
      readonly chargebackAllocations?: boolean;
      readonly reserveAllocation?: boolean;
      readonly paymentIntegrity?: boolean;
      readonly blocks?: boolean;
      readonly holdReleaseEvidence?: boolean;
    } = {}
  ) => {
    if (
      (!options.refundOrigins && record.refundOrigins.length !== 0) ||
      (!options.chargebackAllocations && record.chargebackAllocations.length !== 0) ||
      (!options.reserveAllocation && record.reserveAllocation !== null) ||
      (!options.paymentIntegrity && record.paymentIntegrity !== null) ||
      (!options.blocks && record.blocks !== null) ||
      (!options.holdReleaseEvidence && record.holdReleaseEvidence !== null)
    ) {
      fail("lineage_invalid");
    }
  };
  const authorityIs = (kind: PayableLotOperationAuthority["kind"]): void => {
    if (record.authority?.kind !== kind) fail("lineage_invalid");
  };
  const noAuthority = (): void => {
    if (record.authority !== null) fail("lineage_invalid");
  };

  switch (record.kind) {
    case "sale_capture":
      noAuxiliary();
      noAuthority();
      if (consumed.length !== 0 || created.length !== 1 || created[0]?.parentLotId !== null) {
        fail("lineage_invalid");
      }
      break;
    case "hold_release":
      noAuxiliary({
        reserveAllocation: true,
        paymentIntegrity: true,
        blocks: true,
        holdReleaseEvidence: true
      });
      noAuthority();
      if (
        !record.reserveAllocation ||
        !record.paymentIntegrity ||
        !record.blocks ||
        !record.holdReleaseEvidence ||
        consumed.length !== 1 ||
        created.length < 1 ||
        created.length > 2
      ) {
        fail("lineage_invalid");
      }
      break;
    case "reserve_release":
      noAuxiliary({ paymentIntegrity: true, blocks: true });
      authorityIs("reserve_release");
      if (
        !record.paymentIntegrity ||
        !record.blocks ||
        consumed.length === 0 ||
        created.length !== consumed.length
      ) {
        fail("lineage_invalid");
      }
      break;
    case "payout_requested":
      noAuxiliary();
      authorityIs("payout_request");
      if (consumed.length === 0 || created.length < consumed.length) fail("lineage_invalid");
      break;
    case "payout_released":
      noAuxiliary();
      authorityIs("payout_no_transfer_outcome");
      if (consumed.length === 0 || created.length !== consumed.length) fail("lineage_invalid");
      break;
    case "payout_paid":
      noAuxiliary();
      authorityIs("payout_paid");
      if (consumed.length === 0 || created.length !== 0) fail("lineage_invalid");
      break;
    case "payout_returned_reserved":
      noAuxiliary();
      authorityIs("payout_return");
      if (
        consumed.length !== 0 ||
        created.length === 0 ||
        record.referencedLotIds.length !== created.length
      ) {
        fail("lineage_invalid");
      }
      break;
    case "refund_approved":
      noAuxiliary({ refundOrigins: true });
      authorityIs("refund_approval");
      if (
        (consumed.length === 0 && (created.length !== 0 || record.refundOrigins.length !== 0)) ||
        (consumed.length > 0 &&
          (created.length < consumed.length || record.refundOrigins.length !== consumed.length))
      ) {
        fail("lineage_invalid");
      }
      break;
    case "refund_confirmed":
      noAuxiliary({ refundOrigins: true });
      authorityIs("refund_confirmed");
      if (created.length !== 0) fail("lineage_invalid");
      break;
    case "refund_failed":
      noAuxiliary({ refundOrigins: true });
      authorityIs("refund_failed");
      if (created.length !== consumed.length) fail("lineage_invalid");
      break;
    case "refund_bridge_payout_failed":
      noAuxiliary();
      authorityIs("refund_bridge_payout_failed");
      if (consumed.length === 0 || created.length > consumed.length) fail("lineage_invalid");
      break;
    case "chargeback_confirmed":
      noAuxiliary();
      authorityIs("chargeback_confirmed");
      if (consumed.length !== 0 || created.length !== 0) fail("lineage_invalid");
      break;
    case "chargeback_principal_allocated":
      noAuxiliary({ chargebackAllocations: true });
      authorityIs("chargeback_principal_allocation");
      if (
        created.length > consumed.length ||
        record.chargebackAllocations.length !== consumed.length
      ) {
        fail("lineage_invalid");
      }
      break;
    case "chargeback_recovery_collected":
      noAuxiliary({ chargebackAllocations: true });
      authorityIs("chargeback_recovery_collection");
      if (
        consumed.length === 0 ||
        created.length > consumed.length ||
        record.chargebackAllocations.length !== consumed.length
      ) {
        fail("lineage_invalid");
      }
      break;
    case "chargeback_won_reserved":
      noAuxiliary({ chargebackAllocations: true });
      authorityIs("chargeback_won");
      if (
        consumed.length !== 0 ||
        created.length !== record.referencedLotIds.length ||
        created.length !== record.chargebackAllocations.length
      ) {
        fail("lineage_invalid");
      }
      break;
  }
}
