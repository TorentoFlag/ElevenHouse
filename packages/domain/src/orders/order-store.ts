import type { Money } from "../money";
import type {
  FinanceIdempotentCommand,
  FinanceIdempotentCommandResult
} from "../finance/shared/idempotent-command";

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
  readonly directLinkIntentId: string | null;
  readonly status: OrderStatus;
  readonly grossAmount: Money;
  readonly platformFee: Money;
  readonly astrologerNetAmount: Money;
  readonly financePolicySnapshotId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateFinanceOrderRecordInput = {
  readonly id?: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly productId: string;
  readonly directLinkIntentId: string | null;
  readonly status?: OrderStatus;
  readonly grossAmount: Money;
  readonly platformFee: Money;
  readonly astrologerNetAmount: Money;
  readonly financePolicySnapshotId: string;
  readonly now: string;
};

export type UpdateFinanceOrderStatusInput = {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly now: string;
};

export type FinanceOrderStore = {
  readonly executeCreateOrder: (
    command: FinanceIdempotentCommand,
    createInput: () => Promise<CreateFinanceOrderRecordInput>
  ) => Promise<FinanceIdempotentCommandResult<FinanceOrder>>;
  readonly create: (input: CreateFinanceOrderRecordInput) => Promise<FinanceOrder>;
  readonly updateStatus: (input: UpdateFinanceOrderStatusInput) => Promise<FinanceOrder | null>;
  readonly findById: (orderId: string) => Promise<FinanceOrder | null>;
};
