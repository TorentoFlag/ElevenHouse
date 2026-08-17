import type {
  PlatformCapabilityBoundaryExclusion,
  PlatformCapabilityContinuationExclusion,
  PlatformCapabilitySurfaceExclusion
} from "./platform-capability-manifest-model";
import {
  mediaPurposeExemptValues,
  navigationSource,
  owners,
  routerSource,
  surface
} from "./platform-capability-manifest-registry";

const excluded = (
  id: string,
  ownerModule: string,
  sourcePath: string,
  identifier: string,
  reason: string
): PlatformCapabilitySurfaceExclusion => ({
  surface: surface(id, ownerModule, sourcePath, identifier),
  policy: "never_tariff_gate",
  reason
});

export const platformCapabilitySurfaceExclusions = [
  excluded(
    "exclude.ui.root",
    owners.router,
    routerSource,
    "/ [Navigate replace -> /auth]",
    "The root redirect is routing infrastructure, not a sellable module."
  ),
  excluded(
    "exclude.ui.not-found",
    owners.router,
    routerSource,
    "*",
    "The not-found route is routing infrastructure, not a sellable module."
  ),
  excluded(
    "exclude.ui.dashboard",
    owners.router,
    routerSource,
    "/dashboard",
    "The authenticated workspace shell is baseline access, not a sellable module."
  ),
  excluded(
    "exclude.ui.auth",
    owners.router,
    routerSource,
    "/auth",
    "Authentication must remain available independently of tariff state."
  ),
  excluded(
    "exclude.ui.finance",
    owners.router,
    routerSource,
    "/finance",
    "Subscription and payout self-service cannot be hidden by the subscription it manages."
  ),
  excluded(
    "exclude.ui.settings",
    owners.router,
    routerSource,
    "/settings",
    "Account settings are baseline access."
  ),
  excluded(
    "exclude.nav.dashboard",
    owners.navigation,
    navigationSource,
    "navigation.items[id=dashboard,href=/dashboard]",
    "The workspace dashboard navigation is baseline shell access."
  ),
  excluded(
    "exclude.nav.personal-page",
    owners.navigation,
    navigationSource,
    "navigation.personalPage[href=https://elevenhouse.app/alisa-vega]",
    "Viewing the direct public link is baseline access; creating or configuring a public page remains an absent capability."
  ),
  excluded(
    "exclude.nav.finance",
    owners.navigation,
    navigationSource,
    "navigation.items[id=finance,href=/finance]",
    "Finance navigation is baseline self-service, never a capability lock."
  ),
  excluded(
    "exclude.nav.settings",
    owners.navigation,
    navigationSource,
    "navigation.footerItems[id=settings,href=/settings]",
    "Settings navigation is baseline self-service, never a capability lock."
  ),
  excluded(
    "exclude.ui.public-direct-link",
    "client-web.clientRoutes",
    "apps/client-web/src/router.tsx",
    "/a/:handle",
    "Direct-link client join is a core product invariant, not the absent PublicPage editor."
  ),
  excluded(
    "exclude.tariffs.catalog.read",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "GET /tariffs",
    "An owner must be able to inspect and select a tariff independently of its current tariff state."
  ),
  excluded(
    "exclude.tariffs.entitlements.read",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "GET /tariffs/entitlements",
    "The entitlement read-model is required to show locked states and recover access."
  ),
  excluded(
    "exclude.tariffs.subscription.create",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "POST /tariffs/subscriptions",
    "Subscription selection must remain available before an owner has an active tariff."
  ),
  excluded(
    "exclude.tariffs.saved-card-disclosure.read",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "GET /tariffs/subscriptions/:subscriptionId/saved-card-disclosure",
    "Saved-card disclosure is a payment-consent obligation, not a tariff capability."
  ),
  excluded(
    "exclude.tariffs.saved-card-setup.create",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "POST /tariffs/subscriptions/:subscriptionId/saved-card-setup",
    "Saved-card setup is required to pay for a tariff and cannot require that tariff first."
  ),
  excluded(
    "exclude.tariffs.saved-card-setup.current.read",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "GET /tariffs/subscriptions/:subscriptionId/saved-card-setup",
    "The owner must be able to resume a pending tariff payment setup."
  ),
  excluded(
    "exclude.tariffs.saved-card-setup.execute",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "POST /tariffs/saved-card-setups/:setupSessionId/execute",
    "Executing the saved-card setup is a tariff-payment continuation."
  ),
  excluded(
    "exclude.tariffs.saved-card-setup.complete-3ds-method",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "POST /tariffs/saved-card-setups/:setupSessionId/complete-3ds-method",
    "Completing a saved-card 3DS method is a tariff-payment continuation."
  ),
  excluded(
    "exclude.tariffs.saved-card-setup.status.read",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "GET /tariffs/saved-card-setups/:setupSessionId",
    "The owner must be able to inspect a pending saved-card setup."
  ),
  excluded(
    "exclude.tariffs.invoice-payment.status.read",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "GET /tariffs/invoices/:invoiceId/payment-status",
    "The owner must be able to inspect a tariff invoice payment outcome."
  ),
  excluded(
    "exclude.tariffs.subscription-payment.status.read",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "GET /tariffs/subscriptions/:subscriptionId/payment-status",
    "The owner must be able to inspect the current tariff payment outcome."
  ),
  excluded(
    "exclude.tariffs.invoice-payment.complete-3ds-method",
    "astrologer-api.AstrologerTariffsModule",
    "apps/astrologer-api/src/modules/platform-tariffs/platform-tariffs.controller.ts",
    "POST /tariffs/invoices/:invoiceId/complete-3ds-method",
    "Completing tariff-invoice 3DS is a payment continuation, not a paid capability."
  ),
  excluded(
    "exclude.finance.read",
    "astrologer-api.FinanceModule",
    "apps/astrologer-api/src/modules/finance/finance.controller.ts",
    "GET /finance/me",
    "Finance self-service is never tariff-gated."
  ),
  excluded(
    "exclude.finance.operations",
    "astrologer-api.FinanceModule",
    "apps/astrologer-api/src/modules/finance/finance.controller.ts",
    "GET /finance/operations",
    "Financial history remains available for reconciliation and audit."
  ),
  excluded(
    "exclude.finance.payout-method",
    "astrologer-api.FinanceModule",
    "apps/astrologer-api/src/modules/finance/finance.controller.ts",
    "POST /finance/payout-methods/manual-bank-transfer",
    "Payout configuration is a financial obligation, not a plan feature."
  ),
  excluded(
    "exclude.finance.payout-request",
    "astrologer-api.FinanceModule",
    "apps/astrologer-api/src/modules/finance/finance.controller.ts",
    "POST /finance/payout-requests",
    "Owed-funds payout continuation must survive tariff expiry."
  ),
  excluded(
    "exclude.bookings.cancel",
    "astrologer-api.BookingsModule",
    "apps/astrologer-api/src/modules/bookings/bookings.controller.ts",
    "POST /bookings/:bookingId/cancel",
    "Cancellation of an existing client booking must remain available after tariff expiry."
  ),
  excluded(
    "exclude.bookings.complete",
    "astrologer-api.BookingsModule",
    "apps/astrologer-api/src/modules/bookings/bookings.controller.ts",
    "POST /bookings/:bookingId/complete",
    "Completion of an existing client booking must remain available after tariff expiry."
  ),
  excluded(
    "exclude.bookings.reschedule",
    "astrologer-api.BookingsModule",
    "apps/astrologer-api/src/modules/bookings/bookings.controller.ts",
    "POST /bookings/:bookingId/reschedule",
    "Rescheduling an existing client booking must remain available after tariff expiry."
  ),
  excluded(
    "exclude.profile.read",
    "astrologer-api.AstrologerProfileModule",
    "apps/astrologer-api/src/modules/astrologer-profile/astrologer-profile.controller.ts",
    "GET /astrologer-profile/me",
    "Account profile is baseline access."
  ),
  excluded(
    "exclude.profile.update",
    "astrologer-api.AstrologerProfileModule",
    "apps/astrologer-api/src/modules/astrologer-profile/astrologer-profile.controller.ts",
    "PUT /astrologer-profile/me",
    "Account profile control is baseline access."
  ),
  excluded(
    "exclude.verification.read",
    "astrologer-api.VerificationModule",
    "apps/astrologer-api/src/modules/verification/verification.controller.ts",
    "GET /verification/me",
    "Verification state is compliance infrastructure."
  ),
  excluded(
    "exclude.verification.apply",
    "astrologer-api.VerificationModule",
    "apps/astrologer-api/src/modules/verification/verification.controller.ts",
    "POST /verification/applications",
    "Verification submission is compliance infrastructure."
  ),
  excluded(
    "exclude.identity.astrologer.passwordless.request-code",
    "astrologer-api.IdentityModule",
    "apps/astrologer-api/src/modules/identity/passwordless/identity-passwordless.controller.ts",
    "POST /identity/astrologer/passwordless/request-code",
    "Authentication initiation must remain available independently of tariff state."
  ),
  excluded(
    "exclude.identity.astrologer.passwordless.verify-code",
    "astrologer-api.IdentityModule",
    "apps/astrologer-api/src/modules/identity/passwordless/identity-passwordless.controller.ts",
    "POST /identity/astrologer/passwordless/verify-code",
    "Authentication verification must remain available independently of tariff state."
  ),
  excluded(
    "exclude.identity.astrologer.registration.verify-code",
    "astrologer-api.IdentityModule",
    "apps/astrologer-api/src/modules/identity/registration/identity-registration.controller.ts",
    "POST /identity/astrologer/registration/passwordless/verify-code",
    "Account registration is identity infrastructure, not a tariff capability."
  ),
  excluded(
    "exclude.identity.astrologer.current-account.read",
    "astrologer-api.IdentityModule",
    "apps/astrologer-api/src/modules/identity/session/identity-current-account.controller.ts",
    "GET /identity/me",
    "Current-account identity access must remain available independently of tariff state."
  ),
  excluded(
    "exclude.identity.astrologer.logout",
    "astrologer-api.IdentityModule",
    "apps/astrologer-api/src/modules/identity/session/identity-session.controller.ts",
    "POST /identity/logout",
    "Session termination must never be tariff-gated."
  ),
  excluded(
    "exclude.identity.public.passwordless.request-code",
    "public-api.IdentityModule",
    "apps/public-api/src/modules/identity/passwordless/identity-passwordless.controller.ts",
    "POST /identity/passwordless/request-code",
    "Client authentication initiation must remain available independently of astrologer tariff state."
  ),
  excluded(
    "exclude.identity.public.passwordless.verify-code",
    "public-api.IdentityModule",
    "apps/public-api/src/modules/identity/passwordless/identity-passwordless.controller.ts",
    "POST /identity/passwordless/verify-code",
    "Client authentication verification must remain available independently of astrologer tariff state."
  ),
  excluded(
    "exclude.identity.public.registration.verify-code",
    "public-api.IdentityModule",
    "apps/public-api/src/modules/identity/registration/identity-registration.controller.ts",
    "POST /identity/registration/passwordless/verify-code",
    "Client registration is identity infrastructure, not an astrologer tariff capability."
  ),
  excluded(
    "exclude.identity.public.current-account.read",
    "public-api.IdentityModule",
    "apps/public-api/src/modules/identity/session/identity-current-account.controller.ts",
    "GET /identity/me",
    "Client-owned account access must remain available independently of astrologer tariff state."
  ),
  excluded(
    "exclude.identity.public.logout",
    "public-api.IdentityModule",
    "apps/public-api/src/modules/identity/session/identity-session.controller.ts",
    "POST /identity/logout",
    "Client session termination must never be tariff-gated."
  ),
  excluded(
    "exclude.health.astrologer-api",
    "astrologer-api.HealthModule",
    "apps/astrologer-api/src/modules/health/health.controller.ts",
    "GET /health",
    "Health probes are infrastructure."
  ),
  excluded(
    "exclude.health.public-api",
    "public-api.HealthModule",
    "apps/public-api/src/modules/health/health.controller.ts",
    "GET /health",
    "Health probes are infrastructure."
  ),
  excluded(
    "exclude.orders.public-order.read",
    "public-api.OrdersModule",
    "apps/public-api/src/modules/orders/orders.controller.ts",
    "GET /orders/:orderId",
    "An owner-scoped order read is a post-purchase obligation and must remain available after tariff expiry."
  ),
  excluded(
    "exclude.payments.checkout",
    "public-api.PaymentsModule",
    "apps/public-api/src/modules/payments/payments.controller.ts",
    "POST /payments/checkout",
    "Checkout continues an accepted order using immutable order and entitlement snapshots."
  ),
  excluded(
    "exclude.payments.checkout-state",
    "public-api.PaymentsModule",
    "apps/public-api/src/modules/payments/payments.controller.ts",
    "GET /payments/checkout-preparations/:checkoutPreparationId",
    "Reading an owner-scoped checkout preparation is a payment continuation using an immutable accepted order snapshot."
  ),
  excluded(
    "exclude.payments.checkout-action",
    "public-api.PaymentsModule",
    "apps/public-api/src/modules/payments/payments.controller.ts",
    "GET /payments/checkout-preparations/:checkoutPreparationId/action",
    "Checkout action delivery continues an accepted order using the immutable checkout preparation and entitlement snapshots."
  ),
  excluded(
    "exclude.auth-code.delivery",
    "notification-worker.auth-code-delivery",
    "apps/notification-worker/src/auth-code-delivery.queue.ts",
    "notifications.auth-code-delivery/deliver-passwordless-auth-code",
    "Authentication-code delivery is never a sellable capability."
  ),
  excluded(
    "exclude.pdf.cleanup",
    owners.pdfWorker,
    "apps/workers/src/calculation-pdf/calculation-pdf.queue.ts",
    "calculation.pdf/delete-calculation-pdf",
    "Retention cleanup must run regardless of current tariff."
  ),
  excluded(
    "exclude.messaging.oauth-callback",
    owners.messaging,
    "apps/astrologer-api/src/modules/messaging/instagram-graph-oauth.controller.ts",
    "GET /messaging/channel-connections/instagram/graph/callback",
    "A provider callback completes an already-started security ceremony and must not be tariff-gated."
  ),
  excluded(
    "exclude.messaging.telegram-webhook",
    owners.messaging,
    "apps/astrologer-api/src/modules/messaging/messaging-webhooks.controller.ts",
    "POST /messaging/webhooks/telegram/bot",
    "Authenticated inbound provider traffic must be accepted for audit and existing obligations."
  ),
  excluded(
    "exclude.messaging.instagram-webhook-verify",
    owners.messaging,
    "apps/astrologer-api/src/modules/messaging/messaging-webhooks.controller.ts",
    "GET /messaging/webhooks/instagram/graph",
    "Provider webhook verification is infrastructure, not a sellable user operation."
  ),
  excluded(
    "exclude.messaging.instagram-webhook",
    owners.messaging,
    "apps/astrologer-api/src/modules/messaging/messaging-webhooks.controller.ts",
    "POST /messaging/webhooks/instagram/graph",
    "Authenticated inbound provider traffic must be accepted for audit and existing obligations."
  ),
  excluded(
    "exclude.messaging.media-ingestion",
    "notification-worker.messaging-media-ingestion",
    "apps/notification-worker/src/messaging-media-ingestion.queue.ts",
    "messaging.media-ingestion/ingest-message-media",
    "Inbound media ingestion fulfills accepted provider traffic and must not be dropped after entitlement expiry."
  ),
  excluded(
    "exclude.messaging.mtproto-inbound",
    "notification-worker.telegram-mtproto",
    "apps/notification-worker/src/telegram-mtproto-inbound.processor.ts",
    "processTelegramMtprotoInboundMessage",
    "Inbound session traffic is accepted protocol input, not a user-initiated new-work command."
  ),
  excluded(
    "exclude.messaging.mtproto-supervision",
    "notification-worker.telegram-mtproto",
    "apps/notification-worker/src/telegram-mtproto-session-supervisor.ts",
    "TelegramMtprotoSessionSupervisor",
    "Provider session supervision is infrastructure and must not be torn down by a route entitlement check."
  ),
  excluded(
    "exclude.clients.list",
    owners.clients,
    "apps/astrologer-api/src/modules/clients/clients.controller.ts",
    "GET /clients",
    "Clients are shared chart, booking, calendar, and inbox foundations; the absent CRM product must not gate them."
  ),
  excluded(
    "exclude.clients.birth-places",
    owners.clients,
    "apps/astrologer-api/src/modules/clients/clients.controller.ts",
    "GET /clients/birth-places",
    "Birth-place lookup is shared calculation input infrastructure, not CRM access."
  ),
  excluded(
    "exclude.clients.birth-places.geoapify-reference",
    owners.clients,
    "apps/astrologer-api/src/modules/clients/clients.controller.ts",
    "GET /clients/birth-places/geoapify/:providerPlaceId",
    "Resolving a selected birth-place reference is shared calculation input infrastructure, not CRM access."
  ),
  excluded(
    "exclude.clients.get",
    owners.clients,
    "apps/astrologer-api/src/modules/clients/clients.controller.ts",
    "GET /clients/:clientUserId",
    "Client linkage is shared foundation data, not the absent CRM workspace."
  ),
  excluded(
    "exclude.clients.birth-data.update",
    owners.clients,
    "apps/astrologer-api/src/modules/clients/clients.controller.ts",
    "PUT /clients/:clientUserId/birth-data",
    "Birth data is user-owned calculation input and cannot be hidden by CRM tariff state."
  ),
  excluded(
    "exclude.clients.related-birth-profiles.create",
    owners.clients,
    "apps/astrologer-api/src/modules/clients/clients.controller.ts",
    "POST /clients/:clientUserId/related-birth-profiles",
    "Related birth profiles are user-owned relationship calculation inputs and cannot be hidden by CRM tariff state."
  ),
  excluded(
    "exclude.clients.related-birth-profiles.update",
    owners.clients,
    "apps/astrologer-api/src/modules/clients/clients.controller.ts",
    "PUT /clients/:clientUserId/related-birth-profiles/:relatedProfileId",
    "Related birth profile edits are user-owned relationship calculation inputs and cannot be hidden by CRM tariff state."
  ),
  excluded(
    "exclude.client-profile.astrologers",
    "public-api.ClientProfileModule",
    "apps/public-api/src/modules/client-profile/client-profile.controller.ts",
    "GET /me/astrologers",
    "The direct-link relationship cabinet is a client invariant, never an astrologer tariff surface."
  ),
  excluded(
    "exclude.client-profile.overview",
    "public-api.ClientProfileModule",
    "apps/public-api/src/modules/client-profile/client-profile.controller.ts",
    "GET /me/overview",
    "Client-owned cabinet data must remain accessible independently of an astrologer tariff."
  ),
  excluded(
    "exclude.client-profile.birth-data.get",
    "public-api.ClientProfileModule",
    "apps/public-api/src/modules/client-profile/client-profile.controller.ts",
    "GET /me/birth-data",
    "Client-owned sensitive data must not be hidden by an astrologer tariff."
  ),
  excluded(
    "exclude.client-profile.related-birth-profiles.list",
    "public-api.ClientProfileModule",
    "apps/public-api/src/modules/client-profile/client-profile.controller.ts",
    "GET /me/related-birth-profiles",
    "Client-owned related birth profiles must not be hidden by an astrologer tariff."
  ),
  excluded(
    "exclude.client-profile.birth-places",
    "public-api.ClientProfileModule",
    "apps/public-api/src/modules/client-profile/client-profile.controller.ts",
    "GET /me/birth-places",
    "Birth-place lookup is client calculation-input infrastructure, not an astrologer tariff benefit."
  ),
  excluded(
    "exclude.client-profile.birth-data.update",
    "public-api.ClientProfileModule",
    "apps/public-api/src/modules/client-profile/client-profile.controller.ts",
    "PUT /me/birth-data",
    "Client control of their own data is not a tariff benefit."
  ),
  excluded(
    "exclude.client-profile.related-birth-profiles.create",
    "public-api.ClientProfileModule",
    "apps/public-api/src/modules/client-profile/client-profile.controller.ts",
    "POST /me/related-birth-profiles",
    "Client control of family and partner birth profiles is not a tariff benefit."
  ),
  excluded(
    "exclude.client-profile.related-birth-profiles.update",
    "public-api.ClientProfileModule",
    "apps/public-api/src/modules/client-profile/client-profile.controller.ts",
    "PUT /me/related-birth-profiles/:relatedProfileId",
    "Client control of family and partner birth profile edits is not a tariff benefit."
  ),
  excluded(
    "exclude.client-join.create",
    "public-api.ClientJoinModule",
    "apps/public-api/src/modules/client-join/client-join.controller.ts",
    "POST /client-join-intents",
    "Direct-link relationship creation is a core client invariant."
  ),
  ...mediaPurposeExemptValues.flatMap((purpose) => [
    excluded(
      `exclude.media.${purpose}.upload-intent`,
      owners.media,
      "apps/astrologer-api/src/modules/media/media.controller.ts",
      `POST /media/upload-intents [purpose=${purpose}]`,
      "Profile and verification media are baseline account/compliance infrastructure."
    ),
    excluded(
      `exclude.media.${purpose}.complete`,
      owners.media,
      "apps/astrologer-api/src/modules/media/media.controller.ts",
      `POST /media/:mediaId/complete [persisted purpose=${purpose}]`,
      "Profile and verification media completion follows the persisted never-gated purpose."
    )
  ])
] as const satisfies readonly PlatformCapabilitySurfaceExclusion[];

export const platformCapabilityContinuationExclusions = [
  {
    id: "exclude.payment.webhook.continuation",
    surface: surface(
      "exclude.payment.webhook.continuation.surface",
      "payment-worker.webhook-server",
      "apps/payment-worker/src/webhooks/payment-webhook.server.ts",
      "POST /webhooks/arc-pay"
    ),
    processor: {
      ownerModule: "payment-worker.payment-webhook",
      sourcePath: "apps/payment-worker/src/webhooks/payment-webhook.processor.ts",
      identifier: "createPaymentWebhookProcessor#process"
    },
    commands: [
      {
        ownerModule: "payment-worker.arc-pay-payment-reader",
        sourcePath: "apps/payment-worker/src/arc-pay/arc-pay-payment-reader.ts",
        identifier: "createArcPayPaymentAttemptResolver#resolvePaymentAttemptId"
      },
      {
        ownerModule: "domain.payments",
        sourcePath: "packages/domain/src/payments/payment-use-cases.ts",
        identifier: "ingestPaymentProviderWebhook"
      },
      {
        ownerModule: "domain.wallet",
        sourcePath: "packages/domain/src/wallet/ledger-use-cases.ts",
        identifier: "capturePaymentProviderWebhook"
      },
      {
        ownerModule: "domain.payments",
        sourcePath: "packages/domain/src/payments/payment-use-cases.ts",
        identifier: "releaseTerminalPaymentProviderWebhook"
      },
      {
        ownerModule: "domain.wallet",
        sourcePath: "packages/domain/src/wallet/ledger-use-cases.ts",
        identifier: "recordPaymentReversalProviderWebhook"
      },
      {
        ownerModule: "domain.reconciliation",
        sourcePath: "packages/domain/src/reconciliation/reconciliation-use-cases.ts",
        identifier: "recordProviderSettlementMatch"
      },
      {
        ownerModule: "domain.reconciliation",
        sourcePath: "packages/domain/src/reconciliation/reconciliation-use-cases.ts",
        identifier: "recordProviderReconciliationException"
      }
    ],
    policy: "never_tariff_gate",
    reason:
      "A verified provider callback must complete financial state transitions for an already-created payment independently of current tariff state."
  },
  {
    id: "exclude.payment.settlement-reconciliation.continuation",
    surface: surface(
      "exclude.payment.settlement-reconciliation.continuation.surface",
      "payment-worker.settlement-reconciliation",
      "apps/payment-worker/src/reconciliation/settlement-ledger.processor.ts",
      "startSettlementLedgerReconciliationInterval"
    ),
    processor: {
      ownerModule: "payment-worker.settlement-reconciliation",
      sourcePath: "apps/payment-worker/src/reconciliation/settlement-ledger.processor.ts",
      identifier: "createSettlementLedgerReconciliationProcessor#tick"
    },
    commands: [
      {
        ownerModule: "payment-worker.arc-pay-settlement-ledger",
        sourcePath: "apps/payment-worker/src/arc-pay/arc-pay-settlement-ledger-client.ts",
        identifier: "createArcPaySettlementLedgerClient#listSettlementLedger"
      },
      {
        ownerModule: "domain.reconciliation",
        sourcePath: "packages/domain/src/reconciliation/reconciliation-use-cases.ts",
        identifier: "reconcileProviderSettlementLedgerBatch"
      }
    ],
    policy: "never_tariff_gate",
    reason:
      "Provider settlement reconciliation is financial-integrity work for accepted payments and cannot depend on current tariff state."
  },
  {
    id: "exclude.payment.hold-release.continuation",
    surface: surface(
      "exclude.payment.hold-release.continuation.surface",
      "payment-worker.hold-release",
      "apps/payment-worker/src/holds/hold-release.processor.ts",
      "startHoldReleaseInterval"
    ),
    processor: {
      ownerModule: "payment-worker.hold-release",
      sourcePath: "apps/payment-worker/src/holds/hold-release.processor.ts",
      identifier: "createHoldReleaseProcessor#tick"
    },
    commands: [
      {
        ownerModule: "domain.wallet",
        sourcePath: "packages/domain/src/wallet/ledger-use-cases.ts",
        identifier: "releaseDueCapturedSaleHolds"
      }
    ],
    policy: "never_tariff_gate",
    reason:
      "Releasing due captured-sale holds is ledger continuation for accepted payments and cannot depend on current tariff state."
  }
] as const satisfies readonly PlatformCapabilityContinuationExclusion[];

export const platformCapabilityBoundaryExclusions =
  [] as const satisfies readonly PlatformCapabilityBoundaryExclusion[];

export const platformCapabilityPhysicalCollisionWhitelist = {
  "apps/astrologer-api/src/modules/calculations/calculations.controller.ts|GET /calculations": 2,
  "apps/astrologer-api/src/modules/charts/charts.controller.ts|POST /charts/natal/jobs": 2,
  "apps/astrologer-api/src/modules/media/media.controller.ts|POST /media/upload-intents": 5,
  "apps/astrologer-api/src/modules/media/media.controller.ts|POST /media/:mediaId/complete": 5
} as const satisfies Readonly<Record<string, number>>;
