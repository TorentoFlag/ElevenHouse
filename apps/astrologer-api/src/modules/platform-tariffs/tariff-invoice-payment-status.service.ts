import { ConflictException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import {
  tariffInvoicePaymentStatusResponseSchema,
  type TariffInvoicePaymentStatusResponse
} from "@elevenhouse/contracts";
import type {
  FinancePrivateObjectStoragePort,
  PlatformTariffInvoiceCustomerActionReaderPort
} from "@elevenhouse/domain/finance-core";
import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import { decodeArcPayThreeDsAction } from "@elevenhouse/finance-infrastructure";

import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import {
  ASTROLOGER_FINANCE_ARTIFACT_REGISTRY,
  ASTROLOGER_FINANCE_PRIVATE_OBJECT_STORAGE,
  ASTROLOGER_TARIFF_INVOICE_CUSTOMER_ACTION_READER
} from "./platform-tariffs.tokens";

@Injectable()
export class TariffInvoicePaymentStatusService {
  constructor(
    @Inject(ASTROLOGER_TARIFF_INVOICE_CUSTOMER_ACTION_READER)
    private readonly invoices: PlatformTariffInvoiceCustomerActionReaderPort,
    @Inject(ASTROLOGER_FINANCE_PRIVATE_OBJECT_STORAGE)
    private readonly privateStorage: FinancePrivateObjectStoragePort | null,
    @Inject(ASTROLOGER_FINANCE_ARTIFACT_REGISTRY)
    private readonly artifacts: Pick<FinanceArtifactRegistry, "resolvePrivateArtifact">
  ) {}

  async getStatus(
    request: AstrologerSessionRequest,
    invoiceId: string
  ): Promise<TariffInvoicePaymentStatusResponse> {
    const ownerUserId = request.currentAstrologerAccount?.account.id;
    if (!ownerUserId) throw new UnauthorizedException("Valid astrologer session is required");
    const invoice = await this.invoices.findInvoiceForOwner({ invoiceId, ownerUserId });
    if (!invoice) throw new ConflictException("tariff_invoice_not_found");
    if (invoice.state !== "requires_customer_action") {
      return tariffInvoicePaymentStatusResponseSchema.parse({
        invoiceId: invoice.invoiceId,
        subscriptionId: invoice.subscriptionId,
        invoiceVersion: invoice.invoiceVersion,
        state: invoice.state,
        nextAction: nextAction(invoice.state),
        customerAction: null
      });
    }
    if (!this.privateStorage) {
      throw new ServiceUnavailableException("tariff_invoice_action_storage_unavailable");
    }
    const action = await this.invoices.findPendingForOwner({ invoiceId, ownerUserId });
    if (!action || action.invoiceVersion !== invoice.invoiceVersion) {
      throw new ConflictException("tariff_invoice_action_not_available");
    }
    const resolved = await this.artifacts.resolvePrivateArtifact({
      artifactId: action.providerResponseArtifact.artifactId,
      serviceIdentity: "astrologer_billing",
      purpose: "platform_tariff_invoice_customer_action_delivery",
      requestId: `tariff-invoice-action:${invoiceId}:${invoice.invoiceVersion}`
    });
    if (
      resolved.artifactClass !== "provider_canonical_read" ||
      resolved.artifact.artifactId !== action.providerResponseArtifact.artifactId ||
      resolved.artifact.sha256Digest !== action.providerResponseArtifact.sha256Digest ||
      resolved.artifact.byteLength !== action.providerResponseArtifact.byteLength
    ) throw new ConflictException("tariff_invoice_action_artifact_conflict");
    const artifact = await this.privateStorage.readImmutable(resolved.privateObject);
    if (
      artifact.contentType !== "application/json" ||
      artifact.sha256Digest !== action.providerResponseArtifact.sha256Digest ||
      artifact.byteLength !== action.providerResponseArtifact.byteLength
    ) throw new ConflictException("tariff_invoice_action_artifact_conflict");
    let decoded;
    try {
      decoded = decodeArcPayThreeDsAction({
        providerSetupId: action.providerPaymentId,
        responseBytes: artifact.bytes
      });
    } catch {
      throw new ConflictException("tariff_invoice_action_payload_invalid");
    }
    if (decoded.type !== action.actionType || decoded.threeDs.phase !== action.phase) {
      throw new ConflictException("tariff_invoice_action_payload_conflict");
    }
    return tariffInvoicePaymentStatusResponseSchema.parse({
      invoiceId: invoice.invoiceId,
      subscriptionId: invoice.subscriptionId,
      invoiceVersion: invoice.invoiceVersion,
      state: invoice.state,
      nextAction: "complete_3ds",
      customerAction: {
        type: decoded.type,
        threeDs: {
          version: decoded.threeDs.version,
          phase: decoded.threeDs.phase,
          submit: decoded.threeDs.submit
        }
      }
    });
  }

  /** The refresh-safe status lookup for an active tariff subscription. */
  async getCurrentStatus(
    request: AstrologerSessionRequest,
    subscriptionId: string
  ): Promise<TariffInvoicePaymentStatusResponse | null> {
    const ownerUserId = request.currentAstrologerAccount?.account.id;
    if (!ownerUserId) throw new UnauthorizedException("Valid astrologer session is required");
    const invoice = await this.invoices.findCurrentActionableInvoiceForSubscriptionOwner({
      subscriptionId,
      ownerUserId
    });
    if (!invoice) return null;
    return this.getStatus(request, invoice.invoiceId);
  }
}

function nextAction(state: Exclude<TariffInvoicePaymentStatusResponse["state"], "requires_customer_action">) {
  if (state === "captured") return "payment_captured" as const;
  if (state === "declined") return "payment_declined" as const;
  if (state === "failed") return "payment_failed" as const;
  if (state === "payment_pending" || state === "provider_unknown") return "provider_confirmation_pending" as const;
  return "configuration_unavailable" as const;
}
