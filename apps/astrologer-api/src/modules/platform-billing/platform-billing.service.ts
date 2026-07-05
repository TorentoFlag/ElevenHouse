import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { getPlatformBillingOverview, type PlatformBillingStore } from "@elevenhouse/domain";
import {
  billingOverviewResponseSchema,
  type BillingOverviewResponse
} from "@elevenhouse/contracts";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import {
  PLATFORM_BILLING_OPTIONS,
  PLATFORM_BILLING_STORE,
  type PlatformBillingOptions
} from "./platform-billing.tokens";

@Injectable()
export class PlatformBillingService {
  constructor(
    @Inject(PLATFORM_BILLING_STORE) private readonly store: PlatformBillingStore,
    @Inject(PLATFORM_BILLING_OPTIONS) private readonly options: PlatformBillingOptions
  ) {}

  async getCurrentBillingOverview(
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<BillingOverviewResponse> {
    const ownerUserId = request.currentAstrologerAccount?.account.id;
    if (!ownerUserId) {
      throw new UnauthorizedException("Valid astrologer session is required");
    }

    return billingOverviewResponseSchema.parse(
      await getPlatformBillingOverview({
        store: this.store,
        ownerUserId,
        providerConfigured: this.options.providerConfigured
      })
    );
  }
}
