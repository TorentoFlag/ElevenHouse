import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  resolvePlatformTariffCapabilities,
  type PlatformPlanFeatureCode,
  type PlatformTariffEntitlementStore
} from "@elevenhouse/domain";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { PLATFORM_TARIFF_ENTITLEMENT_STORE } from "./platform-entitlements.tokens";
import {
  platformTariffCapabilityMetadataKey,
  type PlatformTariffCapabilityPolicy
} from "./platform-tariff-capability.policy";

/**
 * Runtime entitlement boundary for astrologer-owned paid product surfaces.
 *
 * It deliberately resolves access on every protected request from the exact
 * active subscription and tariff-version digest. No frontend state, default
 * tariff, or catalog entry can grant a capability here.
 */
@Injectable()
export class PlatformTariffCapabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PLATFORM_TARIFF_ENTITLEMENT_STORE)
    private readonly store: PlatformTariffEntitlementStore,
    private readonly clock: SystemClock
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<PlatformTariffCapabilityPolicy | undefined>(
      platformTariffCapabilityMetadataKey,
      [context.getHandler(), context.getClass()]
    );
    if (!policy) return true;

    const request = context.switchToHttp().getRequest<AstrologerSessionRequest>();
    const ownerUserId = request.currentAstrologerAccount?.account.id;
    if (!ownerUserId) {
      throw new UnauthorizedException("Valid astrologer session is required");
    }

    const resolutions = await resolvePlatformTariffCapabilities({
      store: this.store,
      ownerUserId,
      capabilities: requiredCapabilities(policy),
      operation: policy.operation,
      now: this.clock.now().toISOString()
    });
    for (const { capability, decision } of resolutions) {
      if (decision === "allow" || (decision === "read_only" && policy.operation === "read")) {
        continue;
      }

      throw new ForbiddenException({
        statusCode: 403,
        error: "entitlement_required",
        code: "entitlement_required",
        surfaceId: policy.surfaceId,
        capability,
        operation: policy.operation,
        access: decision,
        message: "The current tariff entitlement does not permit this operation"
      });
    }
    return true;
  }
}

function requiredCapabilities(
  policy: PlatformTariffCapabilityPolicy
): readonly PlatformPlanFeatureCode[] {
  if (policy.capabilities) return policy.capabilities;
  return [policy.capability];
}
