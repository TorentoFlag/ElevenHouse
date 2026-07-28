// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AstrologerFinanceOverviewResponse,
  LedgerOperationListResponse
} from "@elevenhouse/contracts";
import { FinancePage } from "./FinancePage";

const mocks = vi.hoisted(() => ({
  useI18n: vi.fn(),
  useDocumentTitle: vi.fn(),
  useCurrentFinanceOverviewQuery: vi.fn(),
  useFinanceOperationsQuery: vi.fn(),
  useCreateManualPayoutMethodMutation: vi.fn(),
  useCreatePayoutRequestMutation: vi.fn()
}));

vi.mock("@elevenhouse/i18n", () => ({
  useI18n: mocks.useI18n
}));

vi.mock("../../common/hooks/useDocumentTitle", () => ({
  useDocumentTitle: mocks.useDocumentTitle
}));

vi.mock("../../features/finance/model/useCurrentFinanceOverviewQuery", () => ({
  useCurrentFinanceOverviewQuery: mocks.useCurrentFinanceOverviewQuery
}));

vi.mock("../../features/finance/model/useFinanceOperationsQuery", () => ({
  useFinanceOperationsQuery: mocks.useFinanceOperationsQuery
}));

vi.mock("../../features/finance/model/useCreateManualPayoutMethodMutation", () => ({
  useCreateManualPayoutMethodMutation: mocks.useCreateManualPayoutMethodMutation
}));

vi.mock("../../features/finance/model/useCreatePayoutRequestMutation", () => ({
  useCreatePayoutRequestMutation: mocks.useCreatePayoutRequestMutation
}));

describe("FinancePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useI18n.mockReturnValue({
      dictionary: {
        finance: {
          documentTitle: "ElevenHouse | Финансы",
          title: "Финансы"
        }
      },
      locale: "ru"
    });
    mocks.useCurrentFinanceOverviewQuery.mockReturnValue({
      data: financeOverview(),
      isLoading: false,
      isError: false,
      refetch: vi.fn()
    });
    mocks.useFinanceOperationsQuery.mockReturnValue({
      data: financeOperations(),
      isLoading: false,
      isError: false,
      refetch: vi.fn()
    });
    mocks.useCreateManualPayoutMethodMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false
    });
    mocks.useCreatePayoutRequestMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false
    });
  });

  afterEach(() => cleanup());

  it("renders the finance wallet using reference balance, payout and operation sections", () => {
    render(<FinancePage />);

    expect(screen.getByRole("heading", { name: "Финансы" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Обновить" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Вывести средства" })).toBeTruthy();
    expect(screen.getByText("Доступно к выводу")).toBeTruthy();
    expect(screen.getByText("В ожидании")).toBeTruthy();
    expect(screen.getByText("История операций")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Выплаты" })).toBeTruthy();
    expect(screen.getByText("Реквизиты")).toBeTruthy();
    expect(screen.getByText("банк вручную")).toBeTruthy();
  });

  it("filters real ledger operation rows by operation kind", () => {
    render(<FinancePage />);

    expect(screen.getByText("Оплата консультации")).toBeTruthy();
    expect(screen.getByText("Chargeback")).toBeTruthy();
    expect(screen.getByText("Выплата на ручной перевод")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Продажи" }));

    expect(screen.getByText("Оплата консультации")).toBeTruthy();
    expect(screen.queryByText("Chargeback")).toBeNull();
    expect(screen.queryByText("Выплата на ручной перевод")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Возвраты" }));

    expect(screen.getByText("Chargeback")).toBeTruthy();
    expect(screen.queryByText("Оплата консультации")).toBeNull();
  });

  it("submits a payout request from the reference side panel controls", () => {
    const mutate = vi.fn();
    mocks.useCreatePayoutRequestMutation.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      isSuccess: false
    });

    render(<FinancePage />);

    fireEvent.change(screen.getByLabelText("Сумма"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать заявку" }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: { amountMinor: 500_000, currency: "RUB" },
        method: "manual_bank_transfer"
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });
});

function financeOverview(): AstrologerFinanceOverviewResponse {
  return {
    balance: {
      astrologerUserId: "55555555-5555-4555-8555-555555555555",
      pending: { amountMinor: 789_000, currency: "RUB" },
      available: { amountMinor: 1_623_000, currency: "RUB" },
      reserved: { amountMinor: 12_000, currency: "RUB" },
      payoutPending: { amountMinor: 450_000, currency: "RUB" },
      negativeBalance: { amountMinor: 0, currency: "RUB" },
      updatedAt: "2026-07-28T10:00:00.000Z"
    },
    defaultPayoutMethod: {
      id: "11111111-1111-4111-8111-111111111111",
      astrologerUserId: "55555555-5555-4555-8555-555555555555",
      method: "manual_bank_transfer",
      currency: "RUB",
      displayName: "Основной счет",
      isDefault: true,
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-20T10:00:00.000Z"
    },
    recentPayoutRequests: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        astrologerUserId: "55555555-5555-4555-8555-555555555555",
        status: "processing_manual",
        amount: { amountMinor: 450_000, currency: "RUB" },
        method: "manual_bank_transfer",
        requestedAt: "2026-07-26T10:00:00.000Z",
        reviewedAt: null,
        completedAt: null,
        adminUserId: null,
        adminNote: null,
        failureReason: null,
        externalReference: null,
        transferredAt: null,
        providerPayoutId: null
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        astrologerUserId: "55555555-5555-4555-8555-555555555555",
        status: "paid",
        amount: { amountMinor: 300_000, currency: "RUB" },
        method: "manual_bank_transfer",
        requestedAt: "2026-07-24T10:00:00.000Z",
        reviewedAt: "2026-07-24T10:30:00.000Z",
        completedAt: "2026-07-24T11:00:00.000Z",
        adminUserId: "77777777-7777-4777-8777-777777777777",
        adminNote: "Paid manually",
        failureReason: null,
        externalReference: "bank-1",
        transferredAt: "2026-07-24T10:55:00.000Z",
        providerPayoutId: null
      }
    ],
    canRequestPayout: true,
    minimumPayoutAmount: { amountMinor: 100_000, currency: "RUB" },
    payoutRequestUnavailableReason: null
  };
}

function financeOperations(): LedgerOperationListResponse {
  return {
    operations: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        operationType: "sale_captured",
        kind: "sale",
        direction: "inflow",
        amount: { amountMinor: 5_000_00, currency: "RUB" },
        signedAmountMinor: 5_000_00,
        balanceBucket: "pending",
        orderId: "66666666-6666-4666-8666-666666666666",
        payoutRequestId: null,
        occurredAt: "2026-07-25T10:00:00.000Z",
        postedAt: "2026-07-25T10:00:01.000Z",
        metadata: { productTitle: "Оплата консультации" }
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        operationType: "chargeback_recorded",
        kind: "refund",
        direction: "outflow",
        amount: { amountMinor: 2_000_00, currency: "RUB" },
        signedAmountMinor: -2_000_00,
        balanceBucket: "negative_balance",
        orderId: "77777777-7777-4777-8777-777777777777",
        payoutRequestId: null,
        occurredAt: "2026-07-26T10:00:00.000Z",
        postedAt: "2026-07-26T10:00:01.000Z",
        metadata: {}
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        operationType: "payout_reserved",
        kind: "payout",
        direction: "outflow",
        amount: { amountMinor: 3_000_00, currency: "RUB" },
        signedAmountMinor: -3_000_00,
        balanceBucket: null,
        orderId: null,
        payoutRequestId: "33333333-3333-4333-8333-333333333333",
        occurredAt: "2026-07-27T10:00:00.000Z",
        postedAt: "2026-07-27T10:00:01.000Z",
        metadata: {}
      }
    ],
    nextCursor: null
  };
}
