import type {
  ClientSubscriptionCadence,
  ClientSubscriptionContract,
  ClientSubscriptionRenewalRequest,
  ClientSubscriptionState
} from "@elevenhouse/contracts";
import type {
  ProductAccessGrant,
  ProductAstroDiaryConfig,
  ProductCurrency,
  ProductDeliveryFormat,
  ProductExecutionMode,
  ProductMethod,
  ProductModifier,
  ProductParticipantMode,
  ProductPaymentModel,
  ProductRequiredClientData,
  ProductStatus,
  ProductType
} from "../products";
import type { ClientRelationshipStatus } from "../clients";
import type { OrderEconomicsSnapshot } from "../finance-core/order-economics";

export type {
  ClientSubscriptionCadence,
  ClientSubscriptionContract,
  ClientSubscriptionRenewalRequest,
  ClientSubscriptionState
};

export type ClientSubscriptionOrderSnapshot = {
  readonly orderId: string;
  readonly productId: string;
  readonly productRevision: number;
  readonly relationshipId: string;
  readonly astrologerUserId: string;
  readonly clientUserId: string;
  readonly priceMinor: number;
  readonly currency: "RUB";
  readonly cadence: ClientSubscriptionCadence;
  readonly billingEconomics: OrderEconomicsSnapshot;
  readonly accessGrants: readonly ProductAccessGrant[];
  readonly deliveryFormats: readonly ProductDeliveryFormat[];
  readonly requiredClientData: readonly ProductRequiredClientData[];
  readonly methods: readonly ProductMethod[];
  readonly modifiers: readonly ProductModifier[];
  readonly astroDiaryConfig: ProductAstroDiaryConfig;
};

export type ClientSubscriptionProductSnapshot = {
  readonly productId: string;
  readonly revision: number;
  readonly ownerUserId: string;
  readonly status: ProductStatus;
  readonly type: ProductType;
  readonly paymentModel: ProductPaymentModel;
  readonly executionMode: ProductExecutionMode;
  readonly participantMode: ProductParticipantMode;
  readonly priceMinor: number;
  readonly currency: ProductCurrency;
  readonly cadence: ClientSubscriptionCadence;
  readonly trialDays: number | null;
  readonly groupSize: number | null;
  readonly packageSessionCount: number | null;
  readonly accessGrants: readonly ProductAccessGrant[];
  readonly deliveryFormats: readonly ProductDeliveryFormat[];
  readonly requiredClientData: readonly ProductRequiredClientData[];
  readonly methods: readonly ProductMethod[];
  readonly modifiers: readonly ProductModifier[];
  readonly astroDiaryConfig: ProductAstroDiaryConfig;
};

export type ClientSubscriptionRelationshipSnapshot = {
  readonly relationshipId: string;
  readonly astrologerUserId: string;
  readonly clientUserId: string;
  readonly status: ClientRelationshipStatus;
};

export type ClientSubscriptionAnchor = {
  readonly capturedAt: string;
  readonly serviceTimezone: string;
  readonly originSequence: number;
  readonly localDateTime: string;
};

export type ClientSubscriptionPeriod = {
  readonly id: string;
  readonly sequence: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly anchor: ClientSubscriptionAnchor;
  readonly resolvedStartLocal: string;
  readonly resolvedStartOffset: string;
  readonly resolvedEndLocal: string;
  readonly resolvedEndOffset: string;
};

export type ClientSubscription = {
  readonly id: string;
  readonly contract: ClientSubscriptionContract;
  readonly journalEpochId: string;
  readonly state: ClientSubscriptionState;
  readonly version: number;
  readonly cancellationEffectiveAt: string | null;
  readonly renewalStoppedAt: string | null;
  readonly renewalRequest: ClientSubscriptionRenewalRequest | null;
  readonly paidPeriods: readonly ClientSubscriptionPeriod[];
  readonly endedPeriodIds: readonly string[];
  readonly appliedFinanceEvidenceIds: readonly string[];
};
