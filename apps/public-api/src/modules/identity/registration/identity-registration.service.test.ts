import { BadRequestException } from "@nestjs/common";
import { ClientAstrologerRelationshipBlockedError } from "@elevenhouse/domain";
import { describe, expect, it } from "vitest";
import type { PasswordlessRateLimitPort } from "../passwordless/identity-passwordless.rate-limit";
import type { DomainRegistrationHandler } from "./identity-registration.handler";
import { IdentityRegistrationService } from "./identity-registration.service";

describe("IdentityRegistrationService", () => {
  it("maps a blocked direct-link relationship to the invalid join-token response", async () => {
    const handler = {
      verifyCodeAndRegister: async () => {
        throw new ClientAstrologerRelationshipBlockedError();
      }
    } as Pick<DomainRegistrationHandler, "verifyCodeAndRegister">;
    const rateLimiter: Pick<PasswordlessRateLimitPort, "consumeVerifyCode"> = {
      consumeVerifyCode: async () => ({ allowed: true })
    };
    const service = new IdentityRegistrationService(
      handler as DomainRegistrationHandler,
      rateLimiter as PasswordlessRateLimitPort
    );

    const error = await service
      .verifyCodeAndRegister({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        displayName: "Марина",
        roles: ["client"],
        clientJoinIntentToken: "join_1234567890abcdef"
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    if (!(error instanceof BadRequestException)) throw error;
    expect(error.getResponse()).toMatchObject({
      message: "Invalid or expired client join intent token"
    });
  });
});
