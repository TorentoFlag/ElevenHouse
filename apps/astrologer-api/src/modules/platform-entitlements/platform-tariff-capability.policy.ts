import { SetMetadata } from "@nestjs/common";
import type {
  PlatformPlanFeatureCode,
  PlatformTariffEntitlementOperation
} from "@elevenhouse/domain";

export const platformTariffCapabilityMetadataKey = "elevenhouse.platform_tariff_capability";

type PlatformTariffCapabilityPolicyBase = Readonly<{
  surfaceId: string;
  operation: PlatformTariffEntitlementOperation;
}>;

export type PlatformTariffCapabilityPolicy =
  | (PlatformTariffCapabilityPolicyBase &
      Readonly<{ capability: PlatformPlanFeatureCode; capabilities?: never }>)
  | (PlatformTariffCapabilityPolicyBase &
      Readonly<{
        capability?: never;
        capabilities: readonly [PlatformPlanFeatureCode, ...PlatformPlanFeatureCode[]];
      }>);

/**
 * Marks an authenticated astrologer API surface as unavailable unless the
 * current immutable tariff subscription grants the named capability.
 */
export function RequirePlatformTariffCapability(policy: PlatformTariffCapabilityPolicy) {
  return SetMetadata(platformTariffCapabilityMetadataKey, policy);
}

/**
 * Marks a surface that needs both a shared paid capability and the exact
 * resource-owning capability. The resolver denies the operation unless every
 * declared capability is allowed by the same active tariff snapshot.
 */
export function RequirePlatformTariffCapabilities(
  policy: Extract<PlatformTariffCapabilityPolicy, { capabilities: unknown }>
) {
  return SetMetadata(platformTariffCapabilityMetadataKey, policy);
}
