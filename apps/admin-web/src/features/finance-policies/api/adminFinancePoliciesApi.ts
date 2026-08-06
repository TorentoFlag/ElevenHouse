import {
  astrologerRiskProfileResponseSchema,
  financePoliciesResponseSchema,
  financePolicyResponseSchema,
  updateAstrologerRiskProfileRequestSchema,
  updateFinancePolicyRequestSchema,
  type AstrologerRiskProfileResponse,
  type FinancePoliciesResponse,
  type FinancePolicyResponse,
  type UpdateAstrologerRiskProfileRequest,
  type UpdateFinancePolicyRequest
} from "@elevenhouse/contracts/finance-policies";
import {
  adminPaymentReversalCaseReviewRequestSchema,
  adminPaymentReversalCaseSchema,
  adminPaymentReversalQueueResponseSchema,
  type AdminPaymentReversalCase,
  type AdminPaymentReversalCaseReviewRequest,
  type AdminPaymentReversalQueueResponse
} from "@elevenhouse/contracts/payments";
import {
  adminOnlinePayoutApprovalRequestSchema,
  adminOnlinePayoutManualExecutionRequestSchema,
  adminOnlinePayoutPaidAuthorizationRequestSchema,
  adminOnlinePayoutPaidRequestSchema,
  adminPayoutQueueResponseSchema,
  payoutBankEvidenceUploadResponseSchema,
  adminPayoutStatusUpdateSchema,
  type AdminOnlinePayoutApprovalRequest,
  type AdminOnlinePayoutManualExecutionRequest,
  type AdminOnlinePayoutPaidAuthorizationRequest,
  type AdminOnlinePayoutPaidRequest,
  type AdminPayoutQueueStatusFilter,
  payoutRequestResponseSchema,
  type AdminPayoutQueueResponse,
  type AdminPayoutStatusUpdate,
  type PayoutBankEvidenceUploadResponse,
  type PayoutRequestResponse
} from "@elevenhouse/contracts/payouts";
import {
  beginFinanceAuthorizationResponseSchema,
  type BeginFinanceAuthorizationResponse
} from "@elevenhouse/contracts";
import {
  adminReconciliationExceptionQueueResponseSchema,
  type AdminReconciliationExceptionEvidenceFilter,
  reconciliationRecordResponseSchema,
  resolveReconciliationExceptionRequestSchema,
  type AdminReconciliationExceptionQueueResponse,
  type ReconciliationRecordResponse,
  type ResolveReconciliationExceptionRequest
} from "@elevenhouse/contracts/reconciliation";

export type AdminFinancePoliciesApi = {
  readonly listPolicies: () => Promise<FinancePoliciesResponse>;
  readonly ensureDefaultPolicy: () => Promise<FinancePolicyResponse>;
  readonly updateDefaultPolicy: (
    request: UpdateFinancePolicyRequest
  ) => Promise<FinancePolicyResponse>;
  readonly updateAstrologerRiskProfile: (
    astrologerUserId: string,
    request: UpdateAstrologerRiskProfileRequest
  ) => Promise<AstrologerRiskProfileResponse>;
  readonly listPayoutRequests: (input?: {
    readonly status?: AdminPayoutQueueStatusFilter;
  }) => Promise<AdminPayoutQueueResponse>;
  readonly listPaymentReversalCases: (
    type?: "all" | "refund" | "chargeback"
  ) => Promise<AdminPaymentReversalQueueResponse>;
  readonly reviewPaymentReversalCase: (
    reversalCaseId: string,
    request: AdminPaymentReversalCaseReviewRequest
  ) => Promise<AdminPaymentReversalCase>;
  readonly listReconciliationExceptions: (input?: {
    readonly evidence?: AdminReconciliationExceptionEvidenceFilter;
  }) => Promise<AdminReconciliationExceptionQueueResponse>;
  readonly resolveReconciliationException: (
    reconciliationRecordId: string,
    request: ResolveReconciliationExceptionRequest
  ) => Promise<ReconciliationRecordResponse>;
  readonly updatePayoutRequestStatus: (
    payoutRequestId: string,
    request: AdminPayoutStatusUpdate
  ) => Promise<PayoutRequestResponse>;
  readonly beginOnlinePayoutApprovalAuthorization: (
    payoutRequestId: string
  ) => Promise<BeginFinanceAuthorizationResponse>;
  readonly approveOnlinePayout: (
    payoutRequestId: string,
    request: AdminOnlinePayoutApprovalRequest
  ) => Promise<PayoutRequestResponse>;
  readonly beginOnlinePayoutManualExecutionAuthorization: (
    payoutRequestId: string
  ) => Promise<BeginFinanceAuthorizationResponse>;
  readonly startOnlinePayoutManualExecution: (
    payoutRequestId: string,
    request: AdminOnlinePayoutManualExecutionRequest
  ) => Promise<PayoutRequestResponse>;
  readonly beginOnlinePayoutPaidAuthorization: (
    payoutRequestId: string,
    request: AdminOnlinePayoutPaidAuthorizationRequest
  ) => Promise<BeginFinanceAuthorizationResponse>;
  readonly confirmOnlinePayoutPaid: (
    payoutRequestId: string,
    request: AdminOnlinePayoutPaidRequest
  ) => Promise<PayoutRequestResponse>;
  readonly uploadPayoutBankEvidence: (file: File) => Promise<PayoutBankEvidenceUploadResponse>;
};

export type CreateAdminFinancePoliciesApiInput = {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
  readonly csrfTokenReader?: () => string | null;
};

export function createAdminFinancePoliciesApi(
  input: CreateAdminFinancePoliciesApiInput = {}
): AdminFinancePoliciesApi {
  const fetcher = input.fetcher ?? fetch;
  const baseUrl = input.baseUrl ?? import.meta.env.VITE_ADMIN_API_BASE_URL ?? "";
  const csrfTokenReader = input.csrfTokenReader ?? readAdminCsrfCookie;

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetcher(`${baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...csrfHeaders(init.method, csrfTokenReader),
        ...init.headers
      }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new AdminFinancePoliciesApiError(response.status, body);
    }
    return body;
  }

  return {
    listPolicies: async () =>
      financePoliciesResponseSchema.parse(await request("/admin/finance/policies")),
    ensureDefaultPolicy: async () =>
      financePolicyResponseSchema.parse(
        await request("/admin/finance/policies/default", { method: "POST" })
      ),
    updateDefaultPolicy: async (rawRequest) => {
      const parsed = updateFinancePolicyRequestSchema.parse(rawRequest);
      return financePolicyResponseSchema.parse(
        await request("/admin/finance/policies/default", {
          method: "PUT",
          body: JSON.stringify(parsed)
        })
      );
    },
    updateAstrologerRiskProfile: async (astrologerUserId, rawRequest) => {
      const parsed = updateAstrologerRiskProfileRequestSchema.parse(rawRequest);
      return astrologerRiskProfileResponseSchema.parse(
        await request(`/admin/finance/risk-profiles/${encodeURIComponent(astrologerUserId)}`, {
          method: "PUT",
          body: JSON.stringify(parsed)
        })
      );
    },
    listPayoutRequests: async (input = {}) =>
      adminPayoutQueueResponseSchema.parse(
        await request(`/admin/finance/payout-requests${searchParams({ status: input.status })}`)
      ),
    listPaymentReversalCases: async (type = "all") => {
      const search = type === "all" ? "" : `?type=${encodeURIComponent(type)}`;
      return adminPaymentReversalQueueResponseSchema.parse(
        await request(`/admin/finance/reversal-cases${search}`)
      );
    },
    reviewPaymentReversalCase: async (reversalCaseId, rawRequest) => {
      const parsed = adminPaymentReversalCaseReviewRequestSchema.parse(rawRequest);
      return adminPaymentReversalCaseSchema.parse(
        await request(
          `/admin/finance/reversal-cases/${encodeURIComponent(reversalCaseId)}/review`,
          {
            method: "PUT",
            body: JSON.stringify(parsed)
          }
        )
      );
    },
    listReconciliationExceptions: async (input = {}) =>
      adminReconciliationExceptionQueueResponseSchema.parse(
        await request(
          `/admin/finance/reconciliation/exceptions${searchParams({ evidence: input.evidence })}`
        )
      ),
    resolveReconciliationException: async (reconciliationRecordId, rawRequest) => {
      const parsed = resolveReconciliationExceptionRequestSchema.parse(rawRequest);
      return reconciliationRecordResponseSchema.parse(
        await request(
          `/admin/finance/reconciliation/exceptions/${encodeURIComponent(reconciliationRecordId)}`,
          {
            method: "PUT",
            body: JSON.stringify(parsed)
          }
        )
      );
    },
    updatePayoutRequestStatus: async (payoutRequestId, rawRequest) => {
      const parsed = adminPayoutStatusUpdateSchema.parse(rawRequest);
      return payoutRequestResponseSchema.parse(
        await request(
          `/admin/finance/payout-requests/${encodeURIComponent(payoutRequestId)}/status`,
          {
            method: "PUT",
            body: JSON.stringify(parsed)
          }
        )
      );
    },
    beginOnlinePayoutApprovalAuthorization: async (payoutRequestId) =>
      beginFinanceAuthorizationResponseSchema.parse(
        await request(
          `/admin/finance/payout-requests/${encodeURIComponent(payoutRequestId)}/approval/authorization`,
          { method: "POST" }
        )
      ),
    approveOnlinePayout: async (payoutRequestId, rawRequest) => {
      const parsed = adminOnlinePayoutApprovalRequestSchema.parse(rawRequest);
      return payoutRequestResponseSchema.parse(
        await request(`/admin/finance/payout-requests/${encodeURIComponent(payoutRequestId)}/approval`, {
          method: "POST",
          body: JSON.stringify(parsed)
        })
      );
    },
    beginOnlinePayoutManualExecutionAuthorization: async (payoutRequestId) =>
      beginFinanceAuthorizationResponseSchema.parse(
        await request(
          `/admin/finance/payout-requests/${encodeURIComponent(payoutRequestId)}/manual-execution/authorization`,
          { method: "POST" }
        )
      ),
    startOnlinePayoutManualExecution: async (payoutRequestId, rawRequest) => {
      const parsed = adminOnlinePayoutManualExecutionRequestSchema.parse(rawRequest);
      return payoutRequestResponseSchema.parse(
        await request(
          `/admin/finance/payout-requests/${encodeURIComponent(payoutRequestId)}/manual-execution`,
          {
            method: "POST",
            body: JSON.stringify(parsed)
          }
        )
      );
    },
    beginOnlinePayoutPaidAuthorization: async (payoutRequestId, rawRequest) => {
      const parsed = adminOnlinePayoutPaidAuthorizationRequestSchema.parse(rawRequest);
      return beginFinanceAuthorizationResponseSchema.parse(
        await request(
          `/admin/finance/payout-requests/${encodeURIComponent(payoutRequestId)}/paid/authorization`,
          {
            method: "POST",
            body: JSON.stringify(parsed)
          }
        )
      );
    },
    confirmOnlinePayoutPaid: async (payoutRequestId, rawRequest) => {
      const parsed = adminOnlinePayoutPaidRequestSchema.parse(rawRequest);
      return payoutRequestResponseSchema.parse(
        await request(`/admin/finance/payout-requests/${encodeURIComponent(payoutRequestId)}/paid`, {
          method: "POST",
          body: JSON.stringify(parsed)
        })
      );
    },
    uploadPayoutBankEvidence: async (file) => {
      const response = await fetcher(`${baseUrl}/admin/finance/payout-evidence`, {
        method: "POST",
        body: file,
        credentials: "include",
        headers: {
          "content-type": file.type,
          "idempotency-key": `payout-evidence:${crypto.randomUUID()}`,
          ...csrfHeaders("POST", csrfTokenReader)
        }
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new AdminFinancePoliciesApiError(response.status, body);
      return payoutBankEvidenceUploadResponseSchema.parse(body);
    }
  };
}

export class AdminFinancePoliciesApiError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: unknown
  ) {
    super(`Admin finance policies request failed with status ${status}`);
    this.name = "AdminFinancePoliciesApiError";
  }
}

function csrfHeaders(
  method: string | undefined,
  csrfTokenReader: () => string | null
): Record<string, string> {
  const normalizedMethod = method?.toUpperCase() ?? "GET";
  if (normalizedMethod === "GET" || normalizedMethod === "HEAD") {
    return {};
  }
  const csrfToken = csrfTokenReader();
  return csrfToken ? { "x-csrf-token": csrfToken } : {};
}

function readAdminCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = "elevenhouse_admin_csrf=";
  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function searchParams(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
