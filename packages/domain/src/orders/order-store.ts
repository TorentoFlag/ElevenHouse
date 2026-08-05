import type { Money } from "../money";
import type {
  FinanceIdempotentCommand,
  FinanceIdempotentCommandResult
} from "../finance/shared/idempotent-command";
import type { RiskTier } from "../finance-policies";

export type OrderStatus =
  | "draft"
  | "pending_payment"
  | "paid"
  | "fulfilled"
  | "cancelled"
  | "expired"
  | "partially_refunded"
  | "refunded"
  | "chargeback";

export type FinanceOrder = {
  readonly id: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly productId: string;
  /** Immutable fiscal label captured when the client accepts this order. */
  readonly productTitleSnapshot: string;
  readonly directLinkIntentId: string | null;
  readonly bookingId: string | null;
  readonly status: OrderStatus;
  readonly grossAmount: Money;
  readonly platformFee: Money;
  readonly astrologerNetAmount: Money;
  readonly financePolicySnapshotId: string;
  readonly financePolicyRiskTier: RiskTier;
  readonly financePolicyHoldDurationHours: number;
  readonly financePolicyReserveBps: number;
  readonly financePolicyReserveReleaseDelayDays: number;
  readonly tariffSeriesId: string;
  readonly tariffVersion: number;
  readonly tariffVersionDigest: `sha256:${string}`;
  readonly tariffCommissionBps: number;
  readonly financePolicyProviderSettlementRequired: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateFinanceOrderRecordInput = {
  readonly id?: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly productId: string;
  readonly productTitleSnapshot: string;
  readonly directLinkIntentId: string | null;
  readonly bookingId?: string | null;
  readonly status?: OrderStatus;
  readonly grossAmount: Money;
  readonly platformFee: Money;
  readonly astrologerNetAmount: Money;
  readonly financePolicySnapshotId: string;
  readonly financePolicyRiskTier: RiskTier;
  readonly financePolicyHoldDurationHours: number;
  readonly financePolicyReserveBps: number;
  readonly financePolicyReserveReleaseDelayDays: number;
  readonly tariffSeriesId: string;
  readonly tariffVersion: number;
  readonly tariffVersionDigest: `sha256:${string}`;
  readonly tariffCommissionBps: number;
  readonly financePolicyProviderSettlementRequired: boolean;
  readonly now: string;
};

export type UpdateFinanceOrderStatusInput = {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly now: string;
};

export type ApplyFinancePolicyToOrderInput = {
  readonly orderId: string;
  readonly financePolicySnapshotId: string;
  readonly financePolicyRiskTier: RiskTier;
  readonly financePolicyHoldDurationHours: number;
  readonly financePolicyReserveBps: number;
  readonly financePolicyReserveReleaseDelayDays: number;
  readonly financePolicyProviderSettlementRequired: boolean;
  readonly now: string;
};

export type FinanceOrderStore = {
  readonly executeCreateOrder: (
    command: FinanceIdempotentCommand,
    createInput: () => Promise<CreateFinanceOrderRecordInput>
  ) => Promise<FinanceIdempotentCommandResult<FinanceOrder>>;
  readonly create: (input: CreateFinanceOrderRecordInput) => Promise<FinanceOrder>;
  readonly updateStatus: (input: UpdateFinanceOrderStatusInput) => Promise<FinanceOrder | null>;
  readonly applyFinancePolicy: (
    input: ApplyFinancePolicyToOrderInput
  ) => Promise<FinanceOrder | null>;
  readonly findById: (orderId: string) => Promise<FinanceOrder | null>;
};
