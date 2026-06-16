import { Injectable, Logger } from "@nestjs/common";
import type { AuthCodeDeliveryPort, AuthCodeDeliveryResult } from "@elevenhouse/domain";

@Injectable()
export class DevAuthCodeDeliveryProvider implements AuthCodeDeliveryPort {
  private readonly logger = new Logger(DevAuthCodeDeliveryProvider.name);

  async deliverAuthCode(input: {
    readonly challengeId: string;
    readonly channel: "email" | "phone";
    readonly identifier: string;
    readonly code: string;
    readonly expiresAt: string;
  }): Promise<AuthCodeDeliveryResult> {
    this.logger.log(
      `Dev auth code challenge=${input.challengeId} channel=${input.channel} identifier=${input.identifier} code=${input.code} expiresAt=${input.expiresAt}`
    );

    return {
      provider: "dev",
      status: "sent",
      providerMessageId: `dev:${input.challengeId}`
    };
  }
}
