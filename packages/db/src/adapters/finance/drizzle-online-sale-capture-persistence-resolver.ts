import { createHash } from "node:crypto";

import {
  createFinanceJournalTransaction,
  createOnlineSaleCapturePersistenceCommand,
  createOnlineSaleCaptureReceipt,
  createProviderAccountIdentityBinding,
  type CanonicalOnlineSaleCaptureSemanticCommitReceipt,
  type OnlineSaleCapturePersistenceCommand,
  type OnlineSaleCapturePersistenceResolver,
  type OnlineSaleCaptureResolution
} from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";

import type { FinanceTransaction } from "./drizzle-finance-command-store";
import { financeClientCheckoutAuthorizations } from "../../schema/finance/client-checkout-authorizations.schema";
import {
  financeOrderEconomicsSnapshots,
  financePaidProductFulfillmentDecisions,
  financeRiskPolicyVersions
} from "../../schema/finance/capture-authorities.schema";
import {
  financeCaptureFacts,
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessions
} from "../../schema/finance/economic-payments.schema";
import { orders } from "../../schema/finance/orders.schema";
import { financeOnlineWalletHeads } from "../../schema/finance/online-sale-capture.schema";

export type OnlineSaleCapturePersistenceResolutionReason =
  | "invalid_resolution"
  | "checkout_authorization_conflict"
  | "order_economics_conflict"
  | "capture_authority_conflict"
  | "wallet_identity_conflict";

export class OnlineSaleCapturePersistenceResolutionError extends Error {
  readonly code = "online_sale_capture_resolution_error";

  constructor(readonly reason: OnlineSaleCapturePersistenceResolutionReason) {
    super("Online sale capture could not be resolved from sealed authority");
    this.name = "OnlineSaleCapturePersistenceResolutionError";
  }
}

/**
 * The intentionally small server-owned view consumed by the pure builder. Every member is read
 * under the caller's transaction by the Drizzle resolver below; no provider webhook field is
 * accepted here other than the sealed semantic receipt.
 */
export type LockedOnlineSaleCaptureResolution = {
  semanticCapture: CanonicalOnlineSaleCaptureSemanticCommitReceipt;
  authorization: {
    orderId: string;
    clientUserId: string;
    economicPaymentIntentId: string;
    economicPaymentSessionId: string;
    riskPolicyId: string;
    riskPolicyVersion: string;
    riskPolicyDigest: string;
    fulfillmentDecisionId: string;
    fulfillmentDecisionVersion: string;
    fulfillmentDecisionDigest: string;
  };
  order: {
    id: string;
    clientUserId: string;
    astrologerUserId: string;
    status: string;
    grossAmountMinor: string;
    grossCurrency: string;
    platformFeeAmountMinor: string;
    platformFeeCurrency: string;
    astrologerNetAmountMinor: string;
    astrologerNetCurrency: string;
    tariffCommissionBps: number;
  };
  economics: {
    orderId: string;
    astrologerUserId: string;
    planId: string;
    planVersionId: string;
    grossAmountMinor: string;
    grossCurrency: string;
    commissionAmountMinor: string;
    commissionCurrency: string;
    payableAmountMinor: string;
    payableCurrency: string;
    commissionBps: number;
    allocationRevision: string;
  };
  risk: {
    policyId: string;
    policyVersion: string;
    canonicalDigest: string;
    effectiveRiskTier: string;
    holdAnchor: string;
    holdDurationHours: number;
    reserveBps: number;
    reserveReleaseDelayDays: number;
    providerSettlementRequired: boolean;
    payoutMinimumAmountMinor: string;
    payoutMinimumCurrency: string;
    exceptionAuthorityId: string | null;
    exceptionAuthorityVersion: string | null;
    effectiveAt: string;
  };
  fulfillment: {
    registryKey: string;
    registryRevision: string;
    canonicalDigest: string;
    supported: boolean;
    holdAnchor: string;
    terminalEvidenceOwner: string;
    terminalEvidenceStatus: string;
    terminalEvidenceContractVersion: string;
    cancellationAllocatorOwner: string;
    cancellationAllocatorPort: string;
    cancellationAllocatorPolicyVersion: string;
  };
  walletHead: {
    id: string;
    astrologerUserId: string;
    currency: string;
    revision: string;
    lastCommitmentDigest: string | null;
  } | null;
};

/**
 * Injectable only at a composition root. It deliberately does not open a transaction: the
 * semantic receipt, capture fact, resolver and v2 writer share one database boundary.
 */
export function createDrizzleOnlineSaleCapturePersistenceResolver(): OnlineSaleCapturePersistenceResolver<FinanceTransaction> {
  return Object.freeze({
    async resolveOnlineSaleCapturePersistence(transaction, resolution) {
      const semantic = normalizeSemanticCapture(resolution);
      const authorization = await lockAuthorization(transaction, semantic);
      const [order] = await transaction
        .select({
          id: orders.id,
          clientUserId: orders.clientUserId,
          astrologerUserId: orders.astrologerUserId,
          status: orders.status,
          grossAmountMinor: orders.grossAmountMinor,
          grossCurrency: orders.grossCurrency,
          platformFeeAmountMinor: orders.platformFeeAmountMinor,
          platformFeeCurrency: orders.platformFeeCurrency,
          astrologerNetAmountMinor: orders.astrologerNetAmountMinor,
          astrologerNetCurrency: orders.astrologerNetCurrency,
          tariffCommissionBps: orders.tariffCommissionBps
        })
        .from(orders)
        .where(eq(orders.id, authorization.orderId))
        .limit(1)
        .for("update");
      const [economics] = await transaction
        .select()
        .from(financeOrderEconomicsSnapshots)
        .where(eq(financeOrderEconomicsSnapshots.orderId, authorization.orderId))
        .limit(1)
        .for("share");
      const [risk] = await transaction
        .select()
        .from(financeRiskPolicyVersions)
        .where(
          and(
            eq(financeRiskPolicyVersions.policyId, authorization.riskPolicyId),
            eq(financeRiskPolicyVersions.policyVersion, authorization.riskPolicyVersion),
            eq(financeRiskPolicyVersions.canonicalDigest, authorization.riskPolicyDigest)
          )
        )
        .limit(1)
        .for("share");
      const [fulfillment] = await transaction
        .select()
        .from(financePaidProductFulfillmentDecisions)
        .where(
          and(
            eq(
              financePaidProductFulfillmentDecisions.registryKey,
              authorization.fulfillmentDecisionId
            ),
            eq(
              financePaidProductFulfillmentDecisions.registryRevision,
              authorization.fulfillmentDecisionVersion
            ),
            eq(
              financePaidProductFulfillmentDecisions.canonicalDigest,
              authorization.fulfillmentDecisionDigest
            )
          )
        )
        .limit(1)
        .for("share");
      const [intent] = await transaction
        .select({
          id: financeEconomicPaymentIntents.id,
          purpose: financeEconomicPaymentIntents.purpose,
          sourceId: financeEconomicPaymentIntents.sourceId,
          seriesId: financeEconomicPaymentIntents.seriesId,
          providerAccountId: financeEconomicPaymentIntents.providerAccountId,
          providerIdentityVersion: financeEconomicPaymentIntents.providerIdentityVersion,
          amountMinor: financeEconomicPaymentIntents.amountMinor,
          currency: financeEconomicPaymentIntents.currency,
          state: financeEconomicPaymentIntents.state,
          version: financeEconomicPaymentIntents.version
        })
        .from(financeEconomicPaymentIntents)
        .where(eq(financeEconomicPaymentIntents.id, authorization.economicPaymentIntentId))
        .limit(1)
        .for("update");
      const [session] = await transaction
        .select({
          id: financeEconomicPaymentSessions.id,
          economicPaymentIntentId: financeEconomicPaymentSessions.economicPaymentIntentId,
          seriesId: financeEconomicPaymentSessions.seriesId,
          providerAccountId: financeEconomicPaymentSessions.providerAccountId,
          providerIdentityVersion: financeEconomicPaymentSessions.providerIdentityVersion,
          state: financeEconomicPaymentSessions.state,
          version: financeEconomicPaymentSessions.version
        })
        .from(financeEconomicPaymentSessions)
        .where(eq(financeEconomicPaymentSessions.id, authorization.economicPaymentSessionId))
        .limit(1)
        .for("update");
      if (!order || !economics || !risk || !fulfillment || !intent || !session) {
        fail("checkout_authorization_conflict");
      }
      const walletRows = await transaction
        .select({
          id: financeOnlineWalletHeads.id,
          astrologerUserId: financeOnlineWalletHeads.astrologerUserId,
          currency: financeOnlineWalletHeads.currency,
          revision: financeOnlineWalletHeads.revision,
          lastCommitmentDigest: financeOnlineWalletHeads.lastCommitmentDigest
        })
        .from(financeOnlineWalletHeads)
        .where(
          and(
            eq(financeOnlineWalletHeads.astrologerUserId, order.astrologerUserId),
            eq(financeOnlineWalletHeads.currency, "RUB")
          )
        )
        .limit(2)
        .for("update");
      if (walletRows.length > 1) fail("wallet_identity_conflict");
      return buildOnlineSaleCapturePersistenceCommand({
        semanticCapture: semantic,
        authorization,
        order: orderMoneyRow(order),
        economics: moneyRow(economics),
        risk: moneyRow(risk),
        fulfillment: moneyRow(fulfillment),
        walletHead: walletRows[0] ?? null,
        intent: moneyRow(intent),
        session: moneyRow(session)
      });
    }
  } satisfies OnlineSaleCapturePersistenceResolver<FinanceTransaction>);
}

/**
 * Materializes the shared economic capture authority from the already sealed semantic receipt.
 * It has no webhook payload input and is intentionally independent of legacy wallet receipts.
 * The composite UoW invokes it before resolving/writing the bounded v2 graph.
 */
export async function ensureCanonicalClientOrderCaptureFactInTransaction(
  transaction: FinanceTransaction,
  semanticCapture: CanonicalOnlineSaleCaptureSemanticCommitReceipt
): Promise<string> {
  const semantic = normalizedSemantic(semanticCapture);
  const id = captureFactIdFor(semantic.semanticFactId);
  const [existing] = await transaction
    .select({
      id: financeCaptureFacts.id,
      economicPaymentIntentId: financeCaptureFacts.economicPaymentIntentId,
      economicPaymentSessionId: financeCaptureFacts.economicPaymentSessionId,
      seriesId: financeCaptureFacts.seriesId,
      providerAccountId: financeCaptureFacts.providerAccountId,
      providerIdentityVersion: financeCaptureFacts.providerIdentityVersion,
      providerPaymentId: financeCaptureFacts.providerPaymentId,
      amountMinor: financeCaptureFacts.amountMinor,
      currency: financeCaptureFacts.currency,
      evidenceAuthorityKind: financeCaptureFacts.evidenceAuthorityKind,
      evidenceAuthorityId: financeCaptureFacts.evidenceAuthorityId,
      evidenceArtifactId: financeCaptureFacts.evidenceArtifactId,
      evidenceArtifactDigest: financeCaptureFacts.evidenceArtifactDigest
    })
    .from(financeCaptureFacts)
    .where(eq(financeCaptureFacts.id, id))
    .limit(1)
    .for("share");
  if (existing) {
    assertCaptureFactMatchesSemantic(existing, semantic, id);
    return id;
  }
  const [created] = await transaction
    .insert(financeCaptureFacts)
    .values({
      id,
      economicPaymentIntentId: semantic.economicPaymentIntentId,
      economicPaymentSessionId: semantic.economicPaymentSessionId,
      seriesId: semantic.providerAccount.seriesId,
      providerAccountId: semantic.providerAccount.providerAccountId,
      providerIdentityVersion: semantic.providerAccount.identityVersion,
      providerPaymentId: semantic.providerPaymentId,
      amountMinor: semantic.amountMinor,
      currency: "RUB",
      evidenceAuthorityKind: "provider_semantic_fact",
      evidenceAuthorityId: semantic.semanticFactId,
      evidenceArtifactId: semantic.evidenceArtifactId,
      evidenceArtifactDigest: semantic.evidenceArtifactDigest,
      capturedAt: new Date(semantic.observedAt)
    })
    .returning({ id: financeCaptureFacts.id });
  if (!created || created.id !== id) fail("capture_authority_conflict");
  return id;
}

export function buildOnlineSaleCapturePersistenceCommand(
  input: LockedOnlineSaleCaptureResolution & {
    intent?: {
      id: string;
      purpose: string;
      sourceId: string;
      seriesId: string;
      providerAccountId: string;
      providerIdentityVersion: number;
      amountMinor: string;
      currency: string;
      state: string;
      version: string;
    };
    session?: {
      id: string;
      economicPaymentIntentId: string;
      seriesId: string;
      providerAccountId: string;
      providerIdentityVersion: number;
      state: string;
      version: string;
    };
  }
): OnlineSaleCapturePersistenceCommand {
  try {
    const semantic = normalizedSemantic(input.semanticCapture);
    const captureFactId = captureFactIdFor(semantic.semanticFactId);
    const order = input.order;
    const economics = input.economics;
    const authorization = input.authorization;
    const intent = input.intent ?? impliedIntent(semantic, authorization, order);
    const session = input.session ?? impliedSession(semantic, authorization);
    assertAuthority(input, semantic, intent, session);
    const wallet = walletFor(input.walletHead, order.astrologerUserId);
    const providerAccount = createProviderAccountIdentityBinding({
      seriesId: semantic.providerAccount.seriesId,
      providerAccountId: semantic.providerAccount.providerAccountId,
      identityVersion: semantic.providerAccount.identityVersion
    });
    const gross = minor(economics.grossAmountMinor);
    const commission = minor(economics.commissionAmountMinor);
    const payable = minor(economics.payableAmountMinor);
    const rootLotId = stableUuid(`online-sale-root-lot:${captureFactId}`);
    const occurredAt = semantic.observedAt;
    const risk = Object.freeze({
      id: input.risk.policyId,
      policyVersion: revision(input.risk.policyVersion),
      effectiveRiskTier: input.risk.effectiveRiskTier,
      holdAnchor: input.risk.holdAnchor,
      holdDurationHours: input.risk.holdDurationHours,
      reserveBps: input.risk.reserveBps,
      reserveReleaseDelayDays: input.risk.reserveReleaseDelayDays,
      providerSettlementRequired: input.risk.providerSettlementRequired,
      payoutMinimum: Object.freeze({
        amountMinor: minor(input.risk.payoutMinimumAmountMinor),
        currency: "RUB" as const
      }),
      exceptionAuthority:
        input.risk.exceptionAuthorityId === null
          ? null
          : Object.freeze({
              id: input.risk.exceptionAuthorityId,
              version: revision(input.risk.exceptionAuthorityVersion)
            }),
      effectiveAt: input.risk.effectiveAt
    });
    const fulfillment = Object.freeze({
      supported: input.fulfillment.supported,
      registryKey: input.fulfillment.registryKey,
      registryRevision: revision(input.fulfillment.registryRevision),
      holdAnchor: input.fulfillment.holdAnchor,
      terminalEvidence: Object.freeze({
        owner: input.fulfillment.terminalEvidenceOwner,
        status: input.fulfillment.terminalEvidenceStatus,
        contractVersion: revision(input.fulfillment.terminalEvidenceContractVersion)
      }),
      cancellationAllocator: Object.freeze({
        owner: input.fulfillment.cancellationAllocatorOwner,
        port: input.fulfillment.cancellationAllocatorPort,
        policyVersion: revision(input.fulfillment.cancellationAllocatorPolicyVersion)
      })
    });
    const orderEconomics = Object.freeze({
      orderId: economics.orderId,
      astrologerUserId: economics.astrologerUserId,
      planId: economics.planId,
      planVersionId: economics.planVersionId,
      gross: Object.freeze({ amountMinor: gross, currency: "RUB" as const }),
      commission: Object.freeze({ amountMinor: commission, currency: "RUB" as const }),
      payable: Object.freeze({ amountMinor: payable, currency: "RUB" as const }),
      commissionBps: economics.commissionBps,
      allocationRevision: economics.allocationRevision
    });
    const captureEffect = Object.freeze({
      kind: "client_sale_captured" as const,
      intentId: intent.id,
      sourceId: order.id,
      providerAccount,
      providerPaymentId: semantic.providerPaymentId,
      amount: Object.freeze({ amountMinor: gross, currency: "RUB" as const }),
      canonicalEvidenceId: captureFactId
    });
    const paymentIntent = Object.freeze({
      intentId: intent.id,
      version: 3,
      purpose: "client_order" as const,
      sourceId: order.id,
      providerAccount,
      amount: Object.freeze({ amountMinor: gross, currency: "RUB" as const }),
      state: "captured" as const,
      sessions: Object.freeze([
        Object.freeze({
          sessionId: session.id,
          providerAccount,
          state: "captured" as const,
          evidenceHistory: Object.freeze([
            Object.freeze({
              fromState: "checkout_opened" as const,
              toState: "captured" as const,
              kind: "canonical_provider_result" as const,
              evidenceId: captureFactId
            })
          ])
        })
      ]),
      capture: captureEffect,
      captureSessionId: session.id
    });
    const receipt = createOnlineSaleCaptureReceipt({
      walletId: wallet.id,
      expectedWalletRevision: wallet.revision,
      previousCommitmentDigest: wallet.lastCommitmentDigest,
      transition: {
        operationId: captureFactId,
        consumedLots: [],
        createdLots: [
          {
            lotId: rootLotId,
            rootLotId,
            parentLotId: null,
            lineageDepth: 0,
            sourceId: order.id,
            astrologerUserId: order.astrologerUserId,
            amount: { amountMinor: payable, currency: "RUB" },
            bucket: "pending",
            status: "active",
            capturedAt: occurredAt,
            createdAt: occurredAt,
            becameAvailableAt: null,
            createdByOperationId: captureFactId,
            consumedByOperationId: null,
            consumedAt: null,
            payoutRequestId: null,
            payoutAllocationId: null,
            refundId: null,
            economics: orderEconomics,
            riskPolicy: risk,
            fulfillment,
            captureSource: {
              intentId: intent.id,
              providerAccountId: providerAccount.providerAccountId,
              providerPaymentId: semantic.providerPaymentId,
              canonicalEvidenceId: captureFactId,
              paymentIntent,
              sourceKey: { kind: "order", sourceId: order.id, operation: "sale_captured" }
            }
          }
        ]
      }
    });
    const component = (name: string) => `${name}:${captureFactId}`;
    const saleLinks = (componentId: string, payableLotId: string | null) =>
      Object.freeze({
        originalSaleId: order.id,
        componentId,
        payableLotId,
        payoutAllocationId: null
      });
    const journal = createFinanceJournalTransaction({
      id: `online-sale-journal:${captureFactId}`,
      sourceKey: receipt.sourceKey,
      occurredAt,
      postedAt: occurredAt,
      reversesTransactionId: null,
      entries: [
        {
          account: {
            code: "arc_provider_clearing",
            arcProviderAccountId: providerAccount.providerAccountId,
            currency: "RUB"
          },
          side: "debit",
          amount: orderEconomics.gross,
          links: saleLinks(component("provider-clearing"), null)
        },
        {
          account: {
            code: "astrologer_pending",
            astrologerUserId: order.astrologerUserId,
            currency: "RUB"
          },
          side: "credit",
          amount: orderEconomics.payable,
          links: saleLinks(component("astrologer-payable"), rootLotId)
        },
        ...(commission === 0
          ? []
          : [
              {
                account: {
                  code: "platform_commission_deferred" as const,
                  currency: "RUB" as const
                },
                side: "credit" as const,
                amount: orderEconomics.commission,
                links: saleLinks(component("platform-commission"), null)
              }
            ])
      ]
    });
    return createOnlineSaleCapturePersistenceCommand({
      kind: "online_sale_capture_persistence_command",
      receipt,
      astrologerUserId: order.astrologerUserId,
      journal
    });
  } catch (error) {
    if (error instanceof OnlineSaleCapturePersistenceResolutionError) throw error;
    fail("invalid_resolution");
  }
}

function normalizeSemanticCapture(resolution: OnlineSaleCaptureResolution) {
  return normalizedSemantic(resolution.semanticCapture);
}

function normalizedSemantic(value: CanonicalOnlineSaleCaptureSemanticCommitReceipt) {
  if (
    value.kind !== "webhook_semantic_commit_receipt" ||
    value.semanticSourceKind !== "payment_transition" ||
    value.purpose !== "client_order" ||
    value.economicPaymentSessionId === null ||
    value.providerPaymentId === null ||
    value.amountMinor === null ||
    value.currency !== "RUB"
  ) {
    fail("capture_authority_conflict");
  }
  return value as CanonicalOnlineSaleCaptureSemanticCommitReceipt & {
    economicPaymentSessionId: string;
    providerPaymentId: string;
    amountMinor: string;
    currency: "RUB";
  };
}

async function lockAuthorization(
  transaction: FinanceTransaction,
  semantic: ReturnType<typeof normalizedSemantic>
) {
  const [authorization] = await transaction
    .select({
      orderId: financeClientCheckoutAuthorizations.orderId,
      clientUserId: financeClientCheckoutAuthorizations.clientUserId,
      economicPaymentIntentId: financeClientCheckoutAuthorizations.economicPaymentIntentId,
      economicPaymentSessionId: financeClientCheckoutAuthorizations.economicPaymentSessionId,
      riskPolicyId: financeClientCheckoutAuthorizations.riskPolicyId,
      riskPolicyVersion: financeClientCheckoutAuthorizations.riskPolicyVersion,
      riskPolicyDigest: financeClientCheckoutAuthorizations.riskPolicyDigest,
      fulfillmentDecisionId: financeClientCheckoutAuthorizations.fulfillmentDecisionId,
      fulfillmentDecisionVersion: financeClientCheckoutAuthorizations.fulfillmentDecisionVersion,
      fulfillmentDecisionDigest: financeClientCheckoutAuthorizations.fulfillmentDecisionDigest
    })
    .from(financeClientCheckoutAuthorizations)
    .where(
      eq(
        financeClientCheckoutAuthorizations.economicPaymentSessionId,
        semantic.economicPaymentSessionId
      )
    )
    .limit(1)
    .for("update");
  if (
    !authorization ||
    authorization.economicPaymentIntentId !== semantic.economicPaymentIntentId ||
    authorization.economicPaymentSessionId !== semantic.economicPaymentSessionId
  ) {
    fail("checkout_authorization_conflict");
  }
  return authorization;
}

function assertAuthority(
  input: LockedOnlineSaleCaptureResolution,
  semantic: ReturnType<typeof normalizedSemantic>,
  intent: NonNullable<ReturnType<typeof impliedIntent>>,
  session: NonNullable<ReturnType<typeof impliedSession>>
): void {
  const { authorization, order, economics, risk, fulfillment, walletHead } = input;
  const gross = minor(economics.grossAmountMinor);
  const commission = minor(economics.commissionAmountMinor);
  const payable = minor(economics.payableAmountMinor);
  if (
    authorization.orderId !== order.id ||
    authorization.clientUserId !== order.clientUserId ||
    authorization.economicPaymentIntentId !== semantic.economicPaymentIntentId ||
    authorization.economicPaymentSessionId !== semantic.economicPaymentSessionId ||
    order.status !== "pending_payment" ||
    order.grossCurrency !== "RUB" ||
    order.platformFeeCurrency !== "RUB" ||
    order.astrologerNetCurrency !== "RUB" ||
    order.grossAmountMinor !== economics.grossAmountMinor ||
    order.platformFeeAmountMinor !== economics.commissionAmountMinor ||
    order.astrologerNetAmountMinor !== economics.payableAmountMinor ||
    order.tariffCommissionBps !== economics.commissionBps ||
    economics.orderId !== order.id ||
    economics.astrologerUserId !== order.astrologerUserId ||
    economics.grossCurrency !== "RUB" ||
    economics.commissionCurrency !== "RUB" ||
    economics.payableCurrency !== "RUB" ||
    gross !== minor(semantic.amountMinor) ||
    gross !== commission + payable ||
    authorization.riskPolicyId !== risk.policyId ||
    authorization.riskPolicyVersion !== risk.policyVersion ||
    authorization.riskPolicyDigest !== risk.canonicalDigest ||
    authorization.fulfillmentDecisionId !== fulfillment.registryKey ||
    authorization.fulfillmentDecisionVersion !== fulfillment.registryRevision ||
    authorization.fulfillmentDecisionDigest !== fulfillment.canonicalDigest ||
    intent.id !== semantic.economicPaymentIntentId ||
    intent.purpose !== "client_order" ||
    intent.sourceId !== order.id ||
    intent.seriesId !== semantic.providerAccount.seriesId ||
    intent.providerAccountId !== semantic.providerAccount.providerAccountId ||
    intent.providerIdentityVersion !== semantic.providerAccount.identityVersion ||
    intent.amountMinor !== semantic.amountMinor ||
    intent.currency !== "RUB" ||
    session.id !== semantic.economicPaymentSessionId ||
    session.economicPaymentIntentId !== intent.id ||
    session.seriesId !== intent.seriesId ||
    session.providerAccountId !== intent.providerAccountId ||
    session.providerIdentityVersion !== intent.providerIdentityVersion ||
    (walletHead !== null &&
      (walletHead.astrologerUserId !== order.astrologerUserId || walletHead.currency !== "RUB"))
  ) {
    fail("capture_authority_conflict");
  }
}

function impliedIntent(
  semantic: ReturnType<typeof normalizedSemantic>,
  authorization: LockedOnlineSaleCaptureResolution["authorization"],
  order: LockedOnlineSaleCaptureResolution["order"]
) {
  return {
    id: authorization.economicPaymentIntentId,
    purpose: "client_order",
    sourceId: order.id,
    seriesId: semantic.providerAccount.seriesId,
    providerAccountId: semantic.providerAccount.providerAccountId,
    providerIdentityVersion: semantic.providerAccount.identityVersion,
    amountMinor: semantic.amountMinor,
    currency: "RUB",
    state: "checkout_opened",
    version: "2"
  };
}

function impliedSession(
  semantic: ReturnType<typeof normalizedSemantic>,
  authorization: LockedOnlineSaleCaptureResolution["authorization"]
) {
  return {
    id: authorization.economicPaymentSessionId,
    economicPaymentIntentId: authorization.economicPaymentIntentId,
    seriesId: semantic.providerAccount.seriesId,
    providerAccountId: semantic.providerAccount.providerAccountId,
    providerIdentityVersion: semantic.providerAccount.identityVersion,
    state: "checkout_opened",
    version: "1"
  };
}

function walletFor(
  head: LockedOnlineSaleCaptureResolution["walletHead"],
  astrologerUserId: string
): { id: string; revision: string; lastCommitmentDigest: string | null } {
  return head
    ? { id: head.id, revision: head.revision, lastCommitmentDigest: head.lastCommitmentDigest }
    : {
        id: stableUuid(`online-wallet:${astrologerUserId}`),
        revision: "0",
        lastCommitmentDigest: null
      };
}

function captureFactIdFor(semanticFactId: string): string {
  return `capture:semantic:${createHash("sha256").update(semanticFactId, "utf8").digest("hex")}`;
}

function assertCaptureFactMatchesSemantic(
  value: {
    id: string;
    economicPaymentIntentId: string;
    economicPaymentSessionId: string;
    seriesId: string;
    providerAccountId: string;
    providerIdentityVersion: number;
    providerPaymentId: string;
    amountMinor: string;
    currency: string;
    evidenceAuthorityKind: string;
    evidenceAuthorityId: string;
    evidenceArtifactId: string;
    evidenceArtifactDigest: string;
  },
  semantic: ReturnType<typeof normalizedSemantic>,
  id: string
): void {
  if (
    value.id !== id ||
    value.economicPaymentIntentId !== semantic.economicPaymentIntentId ||
    value.economicPaymentSessionId !== semantic.economicPaymentSessionId ||
    value.seriesId !== semantic.providerAccount.seriesId ||
    value.providerAccountId !== semantic.providerAccount.providerAccountId ||
    value.providerIdentityVersion !== semantic.providerAccount.identityVersion ||
    value.providerPaymentId !== semantic.providerPaymentId ||
    value.amountMinor !== semantic.amountMinor ||
    value.currency !== "RUB" ||
    value.evidenceAuthorityKind !== "provider_semantic_fact" ||
    value.evidenceAuthorityId !== semantic.semanticFactId ||
    value.evidenceArtifactId !== semantic.evidenceArtifactId ||
    value.evidenceArtifactDigest !== semantic.evidenceArtifactDigest
  ) {
    fail("capture_authority_conflict");
  }
}

function stableUuid(value: string): string {
  const hex = createHash("sha256").update(value, "utf8").digest("hex");
  const chars = hex.slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = "89ab"[Number.parseInt(chars[16] ?? "0", 16) % 4] ?? "8";
  return `${chars.slice(0, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12, 16).join("")}-${chars.slice(16, 20).join("")}-${chars.slice(20, 32).join("")}`;
}

function revision(value: string | null): number {
  if (value === null || !/^[1-9][0-9]*$/u.test(value)) fail("invalid_resolution");
  const result = Number(value);
  if (!Number.isSafeInteger(result)) fail("invalid_resolution");
  return result;
}

function minor(value: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) fail("invalid_resolution");
  const result = Number(value);
  if (!Number.isSafeInteger(result)) fail("invalid_resolution");
  return result;
}

function moneyRow<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === "bigint" ? value.toString() : value
    ])
  ) as T;
}

/**
 * `orders` deliberately uses Drizzle's safe bigint-as-number mapping while every finance
 * authority snapshot uses canonical numeric strings. Convert only the three minor-unit columns
 * at this boundary; converting the whole row would corrupt non-money numbers such as BPS.
 */
function orderMoneyRow(
  row: Readonly<{
    id: string;
    clientUserId: string;
    astrologerUserId: string;
    status: string;
    grossAmountMinor: number;
    grossCurrency: string;
    platformFeeAmountMinor: number;
    platformFeeCurrency: string;
    astrologerNetAmountMinor: number;
    astrologerNetCurrency: string;
    tariffCommissionBps: number;
  }>
): LockedOnlineSaleCaptureResolution["order"] {
  return Object.freeze({
    ...row,
    grossAmountMinor: safeMinorUnitString(row.grossAmountMinor),
    platformFeeAmountMinor: safeMinorUnitString(row.platformFeeAmountMinor),
    astrologerNetAmountMinor: safeMinorUnitString(row.astrologerNetAmountMinor)
  });
}

function safeMinorUnitString(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) fail("invalid_resolution");
  return String(value);
}

function fail(reason: OnlineSaleCapturePersistenceResolutionReason): never {
  throw new OnlineSaleCapturePersistenceResolutionError(reason);
}
