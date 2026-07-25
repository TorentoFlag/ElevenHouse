import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
  astrologerRiskProfileResponseSchema,
  financePoliciesResponseSchema,
  financePolicyResponseSchema,
  riskTierValues,
  updateAstrologerRiskProfileRequestSchema,
  updateFinancePolicyRequestSchema,
  type AstrologerRiskProfileResponse,
  type FinancePoliciesResponse,
  type FinancePolicyResponse
} from "@elevenhouse/contracts";
import {
  assignAstrologerRiskProfile,
  ensureDefaultFinancePolicy,
  updateFinancePolicy,
  type FinancePolicyStore
} from "@elevenhouse/domain";
import { SystemClock } from "../../common/system-clock.js";
import {
  ADMIN_FINANCE_POLICY_AUDIT_SINK,
  ADMIN_FINANCE_POLICY_STORE
} from "./finance-policies.tokens";
import type { AdminFinancePolicyAuditSink } from "./finance-policies.audit";

@Injectable()
export class FinancePoliciesService {
  constructor(
    @Inject(ADMIN_FINANCE_POLICY_STORE) private readonly store: FinancePolicyStore,
    @Inject(ADMIN_FINANCE_POLICY_AUDIT_SINK)
    private readonly auditSink: AdminFinancePolicyAuditSink,
    private readonly clock: SystemClock
  ) {}

  async listPolicies(): Promise<FinancePoliciesResponse> {
    const policies = await Promise.all(
      riskTierValues.map((riskTier) => this.store.findActivePolicyByRiskTier(riskTier))
    );
    return financePoliciesResponseSchema.parse({
      policies: policies.filter((policy): policy is NonNullable<typeof policy> => Boolean(policy))
    });
  }

  async ensureDefault(adminUserId: string): Promise<FinancePolicyResponse> {
    const now = this.clock.now();
    const policy = await ensureDefaultFinancePolicy({
      store: this.store,
      adminUserId,
      now
    });
    await this.auditSink.record({
      actorUserId: adminUserId,
      action: "finance_policy.default_created",
      targetId: policy.id,
      occurredAt: now.toISOString(),
      metadata: { riskTier: policy.riskTier, policyVersion: policy.policyVersion }
    });
    return financePolicyResponseSchema.parse(policy);
  }

  async updatePolicy(adminUserId: string, body: unknown): Promise<FinancePolicyResponse> {
    const request = parseBody(updateFinancePolicyRequestSchema, body);
    const now = this.clock.now();
    const policy = await updateFinancePolicy({
      store: this.store,
      adminUserId,
      request,
      now
    });
    await this.auditSink.record({
      actorUserId: adminUserId,
      action: "finance_policy.updated",
      targetId: policy.id,
      occurredAt: now.toISOString(),
      metadata: {
        riskTier: policy.riskTier,
        policyVersion: policy.policyVersion
      }
    });
    return financePolicyResponseSchema.parse(policy);
  }

  async updateRiskProfile(
    adminUserId: string,
    astrologerUserId: string,
    body: unknown
  ): Promise<AstrologerRiskProfileResponse> {
    const request = parseBody(updateAstrologerRiskProfileRequestSchema, body);
    const now = this.clock.now();
    const profile = await assignAstrologerRiskProfile({
      store: this.store,
      adminUserId,
      astrologerUserId,
      request,
      now
    });
    await this.auditSink.record({
      actorUserId: adminUserId,
      action: "astrologer_risk_profile.updated",
      targetId: astrologerUserId,
      occurredAt: now.toISOString(),
      metadata: {
        riskTier: profile.riskTier,
        manualRiskTier: profile.manualRiskTier
      }
    });
    return astrologerRiskProfileResponseSchema.parse(profile);
  }
}

function parseBody<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch {
    throw new BadRequestException("Invalid finance policy request");
  }
}
