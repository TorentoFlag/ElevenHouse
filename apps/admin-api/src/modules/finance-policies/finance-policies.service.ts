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
  updateFinancePolicy
} from "@elevenhouse/domain";
import { SystemClock } from "../../common/system-clock.js";
import { ADMIN_FINANCE_POLICY_UNIT_OF_WORK } from "./finance-policies.tokens";
import type { AdminFinancePolicyUnitOfWork } from "./finance-policies.unit-of-work";

@Injectable()
export class FinancePoliciesService {
  constructor(
    @Inject(ADMIN_FINANCE_POLICY_UNIT_OF_WORK)
    private readonly unitOfWork: AdminFinancePolicyUnitOfWork,
    private readonly clock: SystemClock
  ) {}

  async listPolicies(): Promise<FinancePoliciesResponse> {
    const policies = await this.unitOfWork.execute(({ store }) =>
      Promise.all(riskTierValues.map((riskTier) => store.findActivePolicyByRiskTier(riskTier)))
    );
    return financePoliciesResponseSchema.parse({
      policies: policies.filter((policy): policy is NonNullable<typeof policy> => Boolean(policy))
    });
  }

  async ensureDefault(adminUserId: string): Promise<FinancePolicyResponse> {
    const now = this.clock.now();
    const policy = await this.unitOfWork.execute(async ({ store, auditSink }) => {
      const ensuredPolicy = await ensureDefaultFinancePolicy({
        store,
        adminUserId,
        now
      });
      await auditSink.record({
        actorUserId: adminUserId,
        action: "finance_policy.default_created",
        targetId: ensuredPolicy.id,
        occurredAt: now.toISOString(),
        metadata: { riskTier: ensuredPolicy.riskTier, policyVersion: ensuredPolicy.policyVersion }
      });
      return ensuredPolicy;
    });
    return financePolicyResponseSchema.parse(policy);
  }

  async updatePolicy(adminUserId: string, body: unknown): Promise<FinancePolicyResponse> {
    const request = parseBody(updateFinancePolicyRequestSchema, body);
    const now = this.clock.now();
    const policy = await this.unitOfWork.execute(async ({ store, auditSink }) => {
      const updatedPolicy = await updateFinancePolicy({
        store,
        adminUserId,
        request,
        now
      });
      await auditSink.record({
        actorUserId: adminUserId,
        action: "finance_policy.updated",
        targetId: updatedPolicy.id,
        occurredAt: now.toISOString(),
        metadata: {
          riskTier: updatedPolicy.riskTier,
          policyVersion: updatedPolicy.policyVersion
        }
      });
      return updatedPolicy;
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
    const profile = await this.unitOfWork.execute(async ({ store, auditSink }) => {
      const updatedProfile = await assignAstrologerRiskProfile({
        store,
        adminUserId,
        astrologerUserId,
        request,
        now
      });
      await auditSink.record({
        actorUserId: adminUserId,
        action: "astrologer_risk_profile.updated",
        targetId: astrologerUserId,
        occurredAt: now.toISOString(),
        metadata: {
          riskTier: updatedProfile.riskTier,
          manualRiskTier: updatedProfile.manualRiskTier
        }
      });
      return updatedProfile;
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
