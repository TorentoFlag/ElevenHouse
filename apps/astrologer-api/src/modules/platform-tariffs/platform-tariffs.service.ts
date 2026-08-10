import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import {
  astrologerTariffCatalogResponseSchema,
  astrologerTariffResponseSchema,
  astrologerTariffSubscriptionResponseSchema,
  initiateSavedCardSetupRequestSchema,
  initiateSavedCardSetupResponseSchema,
  executeSavedCardSetupRequestSchema,
  executeSavedCardSetupResponseSchema,
  completeSavedCardSetupThreeDsMethodRequestSchema,
  completeSavedCardSetupThreeDsMethodResponseSchema,
  astrologerTariffEntitlementsResponseSchema,
  savedCardSetupDisclosureResponseSchema,
  savedCardSetupStatusResponseSchema,
  startAstrologerTariffSubscriptionRequestSchema,
  startAstrologerTariffSubscriptionResponseSchema,
  type AstrologerTariffCatalogResponse,
  type AstrologerTariffEntitlementsResponse,
  type AstrologerTariffSubscriptionResponse,
  type InitiateSavedCardSetupResponse,
  type ExecuteSavedCardSetupResponse,
  type CompleteSavedCardSetupThreeDsMethodResponse,
  type SavedCardSetupDisclosureResponse,
  type SavedCardSetupStatusResponse,
  type StartAstrologerTariffSubscriptionResponse
} from "@elevenhouse/contracts";
import {
  createProviderDispatchEnvelope,
  digestFinanceCanonicalValueV1,
  resolveFinanceOperationEnvelope,
  type FinanceOperationResourcePolicyReader,
  type FinancePrivateObjectStoragePort,
  type FinanceTransientSecretVaultPort,
  type SavedCardDisclosureReaderPort,
  type SavedCardSetupCustomerActionReaderPort
} from "@elevenhouse/domain/finance-core";
import {
  canonicalizeFinanceCommandPayload,
  FinanceIdempotencyConflictError,
  FinanceIdempotencyFailedError,
  FinanceIdempotencyInProgressError,
  hashFinanceCommandPayload,
  resolvePlatformTariffCapability,
  type PlatformTariffEntitlementStore,
  type PlatformTariffAuthorityStore,
  type PlatformTariffInvoiceRecord,
  type PlatformTariffSubscriptionRecord,
  type PlatformTariffSubscriptionPurchaseRecord,
  type PlatformTariffVersion
} from "@elevenhouse/domain";
import {
  type FinanceArtifactRegistry,
  SavedCardSetupInitiationPersistenceError,
  type SavedCardSetupOwnerSession,
  type SavedCardSetupSessionReader
} from "@elevenhouse/db/finance";
import {
  decodeArcPayThreeDsAction,
  type ArcPayThreeDsAction
} from "@elevenhouse/finance-infrastructure";
import { PlatformTariffAuthorityPersistenceError } from "@elevenhouse/db/platform-billing";
import { randomBytes, randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import type { AstrologerApiRuntimeConfig } from "../../config/runtime-config";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import {
  ASTROLOGER_FINANCE_OPERATION_RESOURCE_POLICY_READER,
  ASTROLOGER_FINANCE_ARTIFACT_REGISTRY,
  ASTROLOGER_FINANCE_PRIVATE_OBJECT_STORAGE,
  ASTROLOGER_FINANCE_TRANSIENT_SECRET_VAULT,
  ASTROLOGER_SAVED_CARD_SETUP_CUSTOMER_ACTION_READER,
  ASTROLOGER_SAVED_CARD_SETUP_SESSION_READER,
  ASTROLOGER_TARIFF_STORE,
  ASTROLOGER_TARIFF_UNIT_OF_WORK
} from "./platform-tariffs.tokens";
import type { AstrologerTariffUnitOfWork } from "./platform-tariffs.unit-of-work";

@Injectable()
export class AstrologerTariffsService {
  constructor(
    @Inject(ASTROLOGER_TARIFF_STORE)
    private readonly store: Pick<
      PlatformTariffAuthorityStore,
      "listTariffVersions" | "findActiveOrPendingSubscription" | "listRecentCapturedInvoices"
    > &
      PlatformTariffEntitlementStore,
    @Inject(ASTROLOGER_TARIFF_UNIT_OF_WORK)
    private readonly unitOfWork: AstrologerTariffUnitOfWork,
    @Inject(SystemClock) private readonly clock: SystemClock,
    @Inject("ASTROLOGER_SAVED_CARD_DISCLOSURE_READER")
    private readonly disclosureReader: SavedCardDisclosureReaderPort,
    @Inject(ASTROLOGER_SAVED_CARD_SETUP_SESSION_READER)
    private readonly setupSessions: SavedCardSetupSessionReader,
    @Inject(ASTROLOGER_SAVED_CARD_SETUP_CUSTOMER_ACTION_READER)
    private readonly customerActions: SavedCardSetupCustomerActionReaderPort,
    @Inject(ASTROLOGER_FINANCE_OPERATION_RESOURCE_POLICY_READER)
    private readonly operationPolicies: FinanceOperationResourcePolicyReader,
    @Inject(ASTROLOGER_FINANCE_PRIVATE_OBJECT_STORAGE)
    private readonly financePrivateStorage: FinancePrivateObjectStoragePort | null,
    @Inject(ASTROLOGER_FINANCE_TRANSIENT_SECRET_VAULT)
    private readonly transientSecretVault: FinanceTransientSecretVaultPort | null,
    @Inject(ASTROLOGER_FINANCE_ARTIFACT_REGISTRY)
    private readonly artifactRegistry: Pick<FinanceArtifactRegistry, "resolvePrivateArtifact">,
    private readonly configService: ConfigService
  ) {}

  async getCatalog(request: AstrologerSessionRequest): Promise<AstrologerTariffCatalogResponse> {
    const ownerUserId = requireAstrologerUserId(request);
    const [versions, currentSubscription, recentInvoices] = await Promise.all([
      this.store.listTariffVersions(),
      this.store.findActiveOrPendingSubscription(ownerUserId),
      this.store.listRecentCapturedInvoices({ ownerUserId, limit: 3 })
    ]);
    const paymentMethod = currentSubscription
      ? await this.setupSessions.findActivePaymentMethodForSubscriptionOwner({
          subscriptionId: currentSubscription.subscriptionId,
          ownerUserId
        })
      : null;
    return astrologerTariffCatalogResponseSchema.parse({
      tariffs: versions.filter((tariff) => tariff.lifecycle === "published").map(toTariffResponse),
      currentSubscription: currentSubscription ? toSubscriptionResponse(currentSubscription) : null,
      recentInvoices: recentInvoices.map(toInvoiceHistoryItem),
      paymentMethod
    });
  }

  async getEntitlements(
    request: AstrologerSessionRequest
  ): Promise<AstrologerTariffEntitlementsResponse> {
    const ownerUserId = requireAstrologerUserId(request);
    const now = this.clock.now().toISOString();
    const [productsRead, productsMutation, funnelsRead, funnelsMutation] = await Promise.all([
      resolvePlatformTariffCapability({
        store: this.store,
        ownerUserId,
        capability: "products",
        operation: "read",
        now
      }),
      resolvePlatformTariffCapability({
        store: this.store,
        ownerUserId,
        capability: "products",
        operation: "mutation",
        now
      }),
      resolvePlatformTariffCapability({
        store: this.store,
        ownerUserId,
        capability: "funnels",
        operation: "read",
        now
      }),
      resolvePlatformTariffCapability({
        store: this.store,
        ownerUserId,
        capability: "funnels",
        operation: "mutation",
        now
      })
    ]);

    return astrologerTariffEntitlementsResponseSchema.parse({
      products: { read: productsRead, mutation: productsMutation },
      funnels: { read: funnelsRead, mutation: funnelsMutation }
    });
  }

  async startSubscription(
    request: AstrologerSessionRequest,
    idempotencyKey: string,
    body: unknown
  ): Promise<StartAstrologerTariffSubscriptionResponse> {
    const ownerUserId = requireAstrologerUserId(request);
    const parsed = parseRequest(body);
    const now = this.clock.now();
    try {
      const result = await this.unitOfWork.executeIdempotent({
        command: {
          scope: "astrologer.tariff_subscription.select",
          idempotencyKey,
          actorUserId: ownerUserId,
          requestHash: hashFinanceCommandPayload({
            actorUserId: ownerUserId,
            operation: "astrologer.tariff_subscription.select",
            request: parsed
          }),
          now: now.toISOString(),
          expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
        },
        create: async ({ store, auditLogStore }) => {
          const purchase = await store.beginSubscriptionPurchase({
            ownerUserId,
            tariffSeriesId: parsed.tariffSeriesId,
            version: parsed.version,
            billingCycle: parsed.billingCycle,
            now: now.toISOString()
          });
          const value = toStartResponse(purchase);
          await auditLogStore.createEntry({
            actorUserId: ownerUserId,
            action: "platform_tariff.subscription_selected",
            targetType: "platform_tariff_subscription",
            targetId: purchase.subscription.subscriptionId,
            occurredAt: now.toISOString(),
            metadata: {
              tariffSeriesId: purchase.subscription.tariffSeriesId,
              tariffVersion: purchase.subscription.tariffVersion,
              billingCycle: purchase.subscription.billingCycle,
              state: purchase.subscription.state
            }
          });
          return { result: value, value };
        },
        replay: async (result) => startAstrologerTariffSubscriptionResponseSchema.parse(result)
      });
      return result.value;
    } catch (error) {
      throw mapError(error);
    }
  }

  async getSavedCardDisclosure(
    request: AstrologerSessionRequest,
    subscriptionId: string,
    locale: unknown
  ): Promise<SavedCardSetupDisclosureResponse> {
    const ownerUserId = requireAstrologerUserId(request);
    const subscription = await this.requireIncompleteSetupSubscription(ownerUserId, subscriptionId);
    const disclosure = await this.requirePublishedDisclosure(parseLocale(locale));
    return savedCardSetupDisclosureResponseSchema.parse({
      subscriptionId: subscription.subscriptionId,
      expectedSubscriptionVersion: subscription.version,
      disclosure
    });
  }

  async getSavedCardSetupStatus(
    request: AstrologerSessionRequest,
    setupSessionId: string
  ): Promise<SavedCardSetupStatusResponse> {
    const ownerUserId = requireAstrologerUserId(request);
    const session = await this.setupSessions.findForOwner({ setupSessionId, ownerUserId });
    if (!session) throw new ConflictException("saved_card_setup_session_not_found");
    return this.toSavedCardSetupStatus(session, ownerUserId);
  }

  async getCurrentSavedCardSetupStatus(
    request: AstrologerSessionRequest,
    subscriptionId: string
  ): Promise<SavedCardSetupStatusResponse | null> {
    const ownerUserId = requireAstrologerUserId(request);
    const session = await this.setupSessions.findForSubscriptionOwner({
      subscriptionId,
      ownerUserId
    });
    return session ? this.toSavedCardSetupStatus(session, ownerUserId) : null;
  }

  private async toSavedCardSetupStatus(
    session: SavedCardSetupOwnerSession,
    ownerUserId: string
  ): Promise<SavedCardSetupStatusResponse> {
    if (session.state === "requires_customer_action") {
      return this.getSavedCardSetupCustomerActionStatus(session, ownerUserId);
    }
    const action = savedCardSetupNextAction(
      session.state,
      session.providerSetupId,
      this.billingConfig().arcPayBrowserTokenization
    );
    return savedCardSetupStatusResponseSchema.parse({
      setupSessionId: session.setupSessionId,
      subscriptionId: session.subscriptionId,
      setupSessionVersion: session.setupSessionVersion,
      state: session.state,
      nextAction: action.nextAction,
      tokenization: action.tokenization,
      customerAction: null
    });
  }

  async initiateSavedCardSetup(
    request: AstrologerSessionRequest,
    subscriptionId: string,
    idempotencyKey: string,
    body: unknown
  ): Promise<InitiateSavedCardSetupResponse> {
    const ownerUserId = requireAstrologerUserId(request);
    const parsed = parseSavedCardSetupRequest(body);
    const subscription = await this.requireIncompleteSetupSubscription(ownerUserId, subscriptionId);
    if (subscription.version !== parsed.expectedSubscriptionVersion) {
      throw new ConflictException("subscription_version_conflict");
    }
    const disclosure = await this.requirePublishedDisclosure(parsed.noticeLocale);
    if (
      disclosure.version !== parsed.disclosureVersion ||
      disclosure.canonicalDigest !== parsed.disclosureDigest
    ) {
      throw new ConflictException("saved_card_disclosure_changed");
    }
    const billing = this.billingConfig();
    const disclosureSeriesId = billing.savedCardDisclosureSeriesId;
    if (!billing.arcPayConfigured || !disclosureSeriesId) {
      throw new ServiceUnavailableException("saved_card_setup_not_configured");
    }
    const now = this.clock.now();
    try {
      const result = await this.unitOfWork.executeIdempotent({
        command: {
          scope: "astrologer.tariff_subscription.saved_card_setup",
          idempotencyKey,
          actorUserId: ownerUserId,
          requestHash: hashFinanceCommandPayload({
            actorUserId: ownerUserId,
            operation: "astrologer.tariff_subscription.saved_card_setup",
            subscriptionId,
            request: parsed
          }),
          now: now.toISOString(),
          expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
        },
        create: async ({ savedCardSetupInitiation, auditLogStore }) => {
          const receipt = await savedCardSetupInitiation.initiateSavedCardSetup({
            setupSessionId: randomUUID(),
            consentId: `saved-card-consent:${randomUUID()}`,
            subscriptionId,
            ownerUserId,
            expectedSubscriptionVersion: parsed.expectedSubscriptionVersion,
            disclosureSeriesId,
            disclosureVersion: parsed.disclosureVersion,
            disclosureDigest: disclosure.canonicalDigest,
            noticeLocale: parsed.noticeLocale,
            buyerContact: parsed.buyerContact,
            now: now.toISOString()
          });
          const value = initiateSavedCardSetupResponseSchema.parse({
            setupSessionId: receipt.setupSessionId,
            setupSessionVersion: receipt.setupSessionVersion,
            state: receipt.state
          });
          await auditLogStore.createEntry({
            actorUserId: ownerUserId,
            action: "platform_tariff.saved_card_setup_initiated",
            targetType: "finance_saved_card_setup_session",
            targetId: receipt.setupSessionId,
            occurredAt: now.toISOString(),
            metadata: {
              subscriptionId,
              consentId: receipt.consentId,
              disclosureSeriesId,
              disclosureVersion: parsed.disclosureVersion,
              noticeLocale: parsed.noticeLocale
            }
          });
          return { result: value, value };
        },
        replay: async (result) => initiateSavedCardSetupResponseSchema.parse(result)
      });
      return result.value;
    } catch (error) {
      throw mapError(error);
    }
  }

  async executeSavedCardSetup(
    request: AstrologerSessionRequest,
    setupSessionId: string,
    idempotencyKey: string,
    body: unknown
  ): Promise<ExecuteSavedCardSetupResponse> {
    const ownerUserId = requireAstrologerUserId(request);
    const parsed = parseExecuteSavedCardSetupRequest(body);
    const session = await this.setupSessions.findForOwner({ setupSessionId, ownerUserId });
    if (
      !session ||
      session.state !== "tokenization_required" ||
      session.setupSessionVersion !== parsed.expectedSetupSessionVersion ||
      session.providerSetupId === null ||
      session.economicPaymentIntentId === null
    ) {
      throw new ConflictException("saved_card_setup_not_tokenizable");
    }
    const billing = this.billingConfig();
    if (
      !billing.arcPayConfigured ||
      !billing.financeArtifactStorage ||
      !this.financePrivateStorage ||
      !this.transientSecretVault
    ) {
      throw new ServiceUnavailableException("saved_card_setup_not_configured");
    }
    const policy = await this.operationPolicies.findPublishedForOperation({
      operationKind: "platform_card_setup_execute"
    });
    if (!policy)
      throw new ServiceUnavailableException("saved_card_setup_execute_policy_unavailable");
    const operationEnvelope = resolveFinanceOperationEnvelope({
      policy,
      operationKind: "platform_card_setup_execute"
    });
    const now = this.clock.now();
    try {
      const result = await this.unitOfWork.executeIdempotent({
        command: {
          scope: "astrologer.tariff_subscription.saved_card_setup.execute",
          idempotencyKey,
          actorUserId: ownerUserId,
          requestHash: hashFinanceCommandPayload({
            actorUserId: ownerUserId,
            operation: "astrologer.tariff_subscription.saved_card_setup.execute",
            setupSessionId,
            expectedSetupSessionVersion: parsed.expectedSetupSessionVersion
          }),
          now: now.toISOString(),
          expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
        },
        create: async ({ savedCardSetupExecution, auditLogStore }) => {
          const providerOperationIntentId = uuidV7(now);
          const sealedTokenizationSecret =
            await this.transientSecretVault!.sealArcPayCardTokenizationSecret({
              secretId: `saved-card-setup-execute:${providerOperationIntentId}`,
              providerSetupId: session.providerSetupId!,
              cardTokenId: parsed.cardTokenId,
              browserInfo: parsed.browserInfo,
              // ArcPay accepts the browser token only for five minutes; retain a short safety margin.
              providerExpiresAt: new Date(now.getTime() + 4 * 60 * 1000).toISOString()
            });
          const sealedThreeDsMethodContext =
            await this.transientSecretVault!.sealArcPayThreeDsMethodContext({
              secretId: `saved-card-setup-method:${providerOperationIntentId}`,
              providerSetupId: session.providerSetupId!,
              browserInfo: parsed.browserInfo,
              // It contains no card token, but remains one-time and no longer than the setup token window.
              providerExpiresAt: new Date(now.getTime() + 4 * 60 * 1000).toISOString()
            });
          const dispatchEnvelope = createProviderDispatchEnvelope({
            kind: "card_setup",
            step: "execute",
            customerId: session.providerCustomerId,
            providerSetupId: session.providerSetupId!,
            setupExternalId: session.setupSessionId,
            tokenizationSecret: sealedTokenizationSecret
          });
          const bytes = canonicalizeFinanceCommandPayload(dispatchEnvelope);
          if (bytes.byteLength > operationEnvelope.maximumArtifactBytes) {
            throw new ServiceUnavailableException("saved_card_setup_execute_request_too_large");
          }
          const digest = digestFinanceCanonicalValueV1(dispatchEnvelope);
          const artifactId = `arc-card-setup-execute-request:${providerOperationIntentId}`;
          const privateObject = await this.financePrivateStorage!.writeImmutable({
            artifactId,
            contentType: "application/json",
            bytes,
            expectedSha256Digest: digest
          });
          if (
            privateObject.contentType !== "application/json" ||
            privateObject.sha256Digest !== digest ||
            privateObject.byteLength !== bytes.byteLength
          ) {
            throw new ServiceUnavailableException("saved_card_setup_execute_artifact_integrity");
          }
          const receipt = await savedCardSetupExecution.executeSavedCardSetup({
            setupSessionId: session.setupSessionId,
            expectedSetupSessionVersion: parsed.expectedSetupSessionVersion,
            providerOperationIntentId,
            transientSecretRefId: `saved-card-setup-execute:${providerOperationIntentId}`,
            threeDsMethodContextSecretRefId: `saved-card-setup-method:${providerOperationIntentId}`,
            providerAccount: session.providerAccount,
            providerSetupId: session.providerSetupId!,
            providerCustomerId: session.providerCustomerId,
            sealedTokenizationSecret,
            sealedThreeDsMethodContext,
            dispatchArtifact: { artifactId, sha256Digest: digest, byteLength: bytes.byteLength },
            dispatchPrivateObject: privateObject,
            retentionPolicyId: billing.financeArtifactStorage!.requestRetention.policyId,
            retentionPolicyVersion: billing.financeArtifactStorage!.requestRetention.policyVersion,
            operationEnvelope,
            // The persistence boundary binds this provider dispatch key to the operation UUID.
            idempotencyKey: providerOperationIntentId,
            idempotencyRetentionDeadline: new Date(
              now.getTime() + 72 * 60 * 60 * 1000
            ).toISOString()
          });
          const value = parseExecuteSavedCardSetupResponse({
            setupSessionId: receipt.setupSessionId,
            setupSessionVersion: receipt.setupSessionVersion,
            state: receipt.state
          });
          await auditLogStore.createEntry({
            actorUserId: ownerUserId,
            action: "platform_tariff.saved_card_setup_execute_requested",
            targetType: "finance_saved_card_setup_session",
            targetId: receipt.setupSessionId,
            occurredAt: now.toISOString(),
            metadata: {
              providerOperationIntentId: receipt.providerOperationIntentId,
              providerSetupId: session.providerSetupId,
              setupSessionVersion: receipt.setupSessionVersion
            }
          });
          return { result: value, value };
        },
        replay: async (result) => parseExecuteSavedCardSetupResponse(result)
      });
      return result.value;
    } catch (error) {
      throw mapError(error);
    }
  }

  async completeSavedCardSetupThreeDsMethod(
    request: AstrologerSessionRequest,
    setupSessionId: string,
    idempotencyKey: string,
    body: unknown
  ): Promise<CompleteSavedCardSetupThreeDsMethodResponse> {
    const ownerUserId = requireAstrologerUserId(request);
    const parsed = parseCompleteThreeDsMethodRequest(body);
    const billing = this.billingConfig();
    if (
      !billing.arcPayConfigured ||
      !billing.financeArtifactStorage ||
      !this.financePrivateStorage
    ) {
      throw new ServiceUnavailableException("saved_card_setup_not_configured");
    }
    const policy = await this.operationPolicies.findPublishedForOperation({
      operationKind: "platform_card_setup_complete_3ds_method"
    });
    if (!policy)
      throw new ServiceUnavailableException(
        "saved_card_setup_complete_3ds_method_policy_unavailable"
      );
    const operationEnvelope = resolveFinanceOperationEnvelope({
      policy,
      operationKind: "platform_card_setup_complete_3ds_method"
    });
    const now = this.clock.now();
    try {
      const result = await this.unitOfWork.executeIdempotent({
        command: {
          scope: "astrologer.tariff_subscription.saved_card_setup.complete_3ds_method",
          idempotencyKey,
          actorUserId: ownerUserId,
          requestHash: hashFinanceCommandPayload({
            actorUserId: ownerUserId,
            operation: "astrologer.tariff_subscription.saved_card_setup.complete_3ds_method",
            setupSessionId,
            request: parsed
          }),
          now: now.toISOString(),
          expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
        },
        create: async ({ savedCardSetupThreeDsMethodCompletion, auditLogStore }) => {
          const action = await this.customerActions.findPendingForOwner({
            setupSessionId,
            ownerUserId,
            expectedSetupSessionVersion: parsed.expectedSetupSessionVersion
          });
          if (
            !action ||
            action.actionType !== "three_ds_method" ||
            action.phase !== "method" ||
            action.threeDsMethodContextSecretRef === null ||
            action.threeDsMethodContextProviderExpiresAt === null
          ) {
            throw new ConflictException("saved_card_setup_method_action_not_available");
          }
          const providerOperationIntentId = uuidV7(now);
          const dispatchEnvelope = createProviderDispatchEnvelope({
            kind: "card_setup",
            step: "complete_3ds_method",
            providerSetupId: action.providerSetupId,
            setupExternalId: setupSessionId,
            customerActionId: action.customerActionId,
            completionIndicator: parsed.completionIndicator,
            threeDsMethodContextSecret: {
              kind: "sealed_one_time_provider_secret_ref",
              secretRef: action.threeDsMethodContextSecretRef,
              providerExpiresAt: action.threeDsMethodContextProviderExpiresAt,
              providerConsumption: "one_time"
            }
          });
          const bytes = canonicalizeFinanceCommandPayload(dispatchEnvelope);
          if (bytes.byteLength > operationEnvelope.maximumArtifactBytes)
            throw new ServiceUnavailableException("saved_card_setup_method_request_too_large");
          const digest = digestFinanceCanonicalValueV1(dispatchEnvelope);
          const artifactId = `arc-card-setup-method-request:${providerOperationIntentId}`;
          const privateObject = await this.financePrivateStorage!.writeImmutable({
            artifactId,
            contentType: "application/json",
            bytes,
            expectedSha256Digest: digest
          });
          if (
            privateObject.contentType !== "application/json" ||
            privateObject.sha256Digest !== digest ||
            privateObject.byteLength !== bytes.byteLength
          ) {
            throw new ServiceUnavailableException("saved_card_setup_method_artifact_integrity");
          }
          const receipt = await savedCardSetupThreeDsMethodCompletion.completeThreeDsMethod({
            setupSessionId,
            expectedSetupSessionVersion: parsed.expectedSetupSessionVersion,
            customerActionId: action.customerActionId,
            completionIndicator: parsed.completionIndicator,
            providerOperationIntentId,
            idempotencyKey: providerOperationIntentId,
            idempotencyRetentionDeadline: new Date(
              now.getTime() + 72 * 60 * 60 * 1000
            ).toISOString(),
            dispatchArtifact: { artifactId, sha256Digest: digest, byteLength: bytes.byteLength },
            dispatchPrivateObject: privateObject,
            retentionPolicyId: billing.financeArtifactStorage!.requestRetention.policyId,
            retentionPolicyVersion: billing.financeArtifactStorage!.requestRetention.policyVersion,
            operationEnvelope
          });
          const value = completeSavedCardSetupThreeDsMethodResponseSchema.parse({
            setupSessionId,
            setupSessionVersion: parsed.expectedSetupSessionVersion + 1,
            state: "execution_pending"
          });
          await auditLogStore.createEntry({
            actorUserId: ownerUserId,
            action: "platform_tariff.saved_card_setup_three_ds_method_requested",
            targetType: "finance_saved_card_setup_session",
            targetId: setupSessionId,
            occurredAt: now.toISOString(),
            metadata: {
              providerOperationIntentId: receipt.providerOperationIntentId,
              customerActionId: action.customerActionId,
              completionIndicator: parsed.completionIndicator
            }
          });
          return { result: value, value };
        },
        replay: async (result) => completeSavedCardSetupThreeDsMethodResponseSchema.parse(result)
      });
      return result.value;
    } catch (error) {
      throw mapError(error);
    }
  }

  private async requireIncompleteSetupSubscription(ownerUserId: string, subscriptionId: string) {
    const subscription = await this.store.findActiveOrPendingSubscription(ownerUserId);
    if (
      !subscription ||
      subscription.subscriptionId !== subscriptionId ||
      subscription.state !== "incomplete_setup"
    ) {
      throw new ConflictException("subscription_not_incomplete_setup");
    }
    return subscription;
  }

  private async requirePublishedDisclosure(locale: "ru" | "en") {
    const billing = this.billingConfig();
    if (!billing.arcPayConfigured || !billing.savedCardDisclosureSeriesId) {
      throw new ServiceUnavailableException("saved_card_setup_not_configured");
    }
    const disclosure = await this.disclosureReader.findPublishedDisclosure({
      disclosureSeriesId: billing.savedCardDisclosureSeriesId,
      locale
    });
    if (!disclosure) throw new ServiceUnavailableException("saved_card_disclosure_not_published");
    return disclosure;
  }

  private billingConfig(): AstrologerApiRuntimeConfig["billing"] {
    return this.configService.getOrThrow<AstrologerApiRuntimeConfig["billing"]>(
      "astrologerApi.billing"
    );
  }

  private async getSavedCardSetupCustomerActionStatus(
    session: SavedCardSetupOwnerSession,
    ownerUserId: string
  ): Promise<SavedCardSetupStatusResponse> {
    if (!this.financePrivateStorage) {
      throw new ServiceUnavailableException("saved_card_setup_action_storage_unavailable");
    }
    const action = await this.customerActions.findPendingForOwner({
      setupSessionId: session.setupSessionId,
      ownerUserId,
      expectedSetupSessionVersion: session.setupSessionVersion
    });
    if (!action) throw new ConflictException("saved_card_setup_action_not_available");
    const resolvedArtifact = await this.artifactRegistry.resolvePrivateArtifact({
      artifactId: action.providerResponseArtifact.artifactId,
      serviceIdentity: "astrologer_billing",
      purpose: "saved_card_customer_action_delivery",
      requestId: `saved-card-setup-action:${session.setupSessionId}:${session.setupSessionVersion}`
    });
    if (
      resolvedArtifact.artifactClass !== "provider_response" ||
      resolvedArtifact.artifact.artifactId !== action.providerResponseArtifact.artifactId ||
      resolvedArtifact.artifact.sha256Digest !== action.providerResponseArtifact.sha256Digest ||
      resolvedArtifact.artifact.byteLength !== action.providerResponseArtifact.byteLength
    ) {
      throw new ConflictException("saved_card_setup_action_artifact_conflict");
    }
    const artifact = await this.financePrivateStorage.readImmutable(resolvedArtifact.privateObject);
    if (
      artifact.contentType !== "application/json" ||
      artifact.sha256Digest !== action.providerResponseArtifact.sha256Digest ||
      artifact.byteLength !== action.providerResponseArtifact.byteLength
    ) {
      throw new ConflictException("saved_card_setup_action_artifact_conflict");
    }
    let decoded: ArcPayThreeDsAction;
    try {
      decoded = decodeArcPayThreeDsAction({
        providerSetupId: action.providerSetupId,
        responseBytes: artifact.bytes
      });
    } catch {
      throw new ConflictException("saved_card_setup_action_payload_invalid");
    }
    if (decoded.type !== action.actionType || decoded.threeDs.phase !== action.phase) {
      throw new ConflictException("saved_card_setup_action_payload_conflict");
    }
    return savedCardSetupStatusResponseSchema.parse({
      setupSessionId: session.setupSessionId,
      subscriptionId: session.subscriptionId,
      setupSessionVersion: session.setupSessionVersion,
      state: session.state,
      nextAction: "complete_3ds",
      tokenization: null,
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
}

function requireAstrologerUserId(request: AstrologerSessionRequest): string {
  const userId = request.currentAstrologerAccount?.account.id;
  if (!userId) throw new UnauthorizedException("Valid astrologer session is required");
  return userId;
}

function parseRequest(body: unknown) {
  const result = startAstrologerTariffSubscriptionRequestSchema.safeParse(body);
  if (!result.success) throw new BadRequestException("Invalid tariff subscription request");
  return result.data;
}

function parseSavedCardSetupRequest(body: unknown) {
  const result = initiateSavedCardSetupRequestSchema.safeParse(body);
  if (!result.success) throw new BadRequestException("Invalid saved-card setup request");
  return result.data;
}

function parseExecuteSavedCardSetupRequest(body: unknown) {
  const result = executeSavedCardSetupRequestSchema.safeParse(body);
  if (!result.success) throw new BadRequestException("Invalid saved-card setup execution request");
  return result.data;
}

function parseCompleteThreeDsMethodRequest(body: unknown) {
  const result = completeSavedCardSetupThreeDsMethodRequestSchema.safeParse(body);
  if (!result.success)
    throw new BadRequestException("Invalid saved-card 3DS Method completion request");
  return result.data;
}

function parseExecuteSavedCardSetupResponse(value: unknown): ExecuteSavedCardSetupResponse {
  return executeSavedCardSetupResponseSchema.parse(value);
}

function parseLocale(value: unknown): "ru" | "en" {
  if (value === "ru" || value === "en") return value;
  throw new BadRequestException("Saved-card disclosure locale must be ru or en");
}

function savedCardSetupNextAction(
  state: SavedCardSetupOwnerSession["state"],
  providerSetupId: string | null,
  browserTokenization: AstrologerApiRuntimeConfig["billing"]["arcPayBrowserTokenization"]
) {
  if (state === "setup_requested" || state === "preparation_pending") {
    return { nextAction: "provider_setup_pending" as const, tokenization: null };
  }
  if (state === "tokenization_required") {
    if (!providerSetupId || !browserTokenization) {
      return { nextAction: "configuration_unavailable" as const, tokenization: null };
    }
    return {
      nextAction: "tokenize_card" as const,
      tokenization: {
        providerSetupId,
        apiBaseUrl: browserTokenization.apiBaseUrl,
        publishableKey: browserTokenization.publishableKey
      }
    };
  }
  if (state === "credential_active") {
    return { nextAction: "initial_payment_pending" as const, tokenization: null };
  }
  if (state === "setup_failed" || state === "expired") {
    return { nextAction: "setup_failed" as const, tokenization: null };
  }
  return { nextAction: "provider_confirmation_pending" as const, tokenization: null };
}

function toTariffResponse(tariff: PlatformTariffVersion) {
  return astrologerTariffResponseSchema.parse({
    tariffSeriesId: tariff.tariffSeriesId,
    version: tariff.version,
    lifecycle: "published",
    name: tariff.name,
    tagline: tariff.tagline,
    monthlyPriceMinor: tariff.monthlyPriceMinor,
    yearlyPriceMinor: tariff.yearlyPriceMinor,
    monthlyRecurringFrequencyDays: tariff.monthlyRecurringFrequencyDays,
    yearlyRecurringFrequencyDays: tariff.yearlyRecurringFrequencyDays,
    clientSaleCommissionBps: tariff.clientSaleCommissionBps,
    seatsLimit: tariff.seatsLimit,
    bookingsLimit: tariff.bookingsLimit,
    aiRequestsLimit: tariff.aiRequestsLimit,
    automationLimit: tariff.automationLimit,
    isPopular: tariff.isPopular,
    displayOrder: tariff.displayOrder,
    features: tariff.features
  });
}

function toSubscriptionResponse(
  subscription: PlatformTariffSubscriptionRecord
): AstrologerTariffSubscriptionResponse {
  return astrologerTariffSubscriptionResponseSchema.parse({
    subscriptionId: subscription.subscriptionId,
    tariffSeriesId: subscription.tariffSeriesId,
    tariffVersion: subscription.tariffVersion,
    billingCycle: subscription.billingCycle,
    state: subscription.state,
    commissionBpsSnapshot: subscription.commissionBpsSnapshot,
    startsAt: subscription.startsAt,
    endsAt: subscription.endsAt
  });
}

function toInvoiceHistoryItem(invoice: PlatformTariffInvoiceRecord) {
  if (!invoice.capturedAt) {
    throw new ServiceUnavailableException("captured_tariff_invoice_missing_capture_time");
  }
  return {
    invoiceId: invoice.invoiceId,
    subscriptionId: invoice.subscriptionId,
    tariffSeriesId: invoice.tariffSeriesId,
    tariffVersion: invoice.tariffVersion,
    amountMinor: invoice.amountMinor,
    currency: invoice.currency,
    state: "captured" as const,
    capturedAt: invoice.capturedAt
  };
}

function toStartResponse(
  purchase: PlatformTariffSubscriptionPurchaseRecord
): StartAstrologerTariffSubscriptionResponse {
  const subscription = toSubscriptionResponse(purchase.subscription);
  return startAstrologerTariffSubscriptionResponseSchema.parse({
    subscription,
    billingCycle: purchase.subscription.billingCycle,
    nextAction: subscription.state === "active" ? "active" : "saved_card_setup_required"
  });
}

function uuidV7(now: Date): string {
  const milliseconds = now.getTime();
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    throw new ServiceUnavailableException("provider_operation_clock_unavailable");
  }
  const bytes = randomBytes(16);
  bytes[0] = Math.floor(milliseconds / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(milliseconds / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(milliseconds / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(milliseconds / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(milliseconds / 2 ** 8) & 0xff;
  bytes[5] = milliseconds & 0xff;
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return `${bytes.subarray(0, 4).toString("hex")}-${bytes.subarray(4, 6).toString("hex")}-${bytes.subarray(6, 8).toString("hex")}-${bytes.subarray(8, 10).toString("hex")}-${bytes.subarray(10, 16).toString("hex")}`;
}

function mapError(error: unknown): ConflictException {
  if (error instanceof ConflictException || error instanceof BadRequestException) throw error;
  if (
    error instanceof FinanceIdempotencyConflictError ||
    error instanceof FinanceIdempotencyInProgressError ||
    error instanceof FinanceIdempotencyFailedError
  ) {
    return new ConflictException(error.code);
  }
  if (error instanceof PlatformTariffAuthorityPersistenceError) {
    return new ConflictException(error.reason);
  }
  if (error instanceof SavedCardSetupInitiationPersistenceError) {
    if (
      error.reason === "provider_account_not_configured" ||
      error.reason === "saved_card_disclosure_not_published"
    ) {
      return new ServiceUnavailableException(error.reason);
    }
    return new ConflictException(error.reason);
  }
  throw error;
}
