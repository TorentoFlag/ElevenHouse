import { Injectable, Logger } from "@nestjs/common";
import type { AuthCodeDeliveryPort, AuthCodeDeliveryResult } from "@elevenhouse/domain";

export type AuthCodeHttpDeliveryOptions = {
  readonly endpointUrl: string;
  readonly bearerToken: string;
  readonly from: string;
};

type AuthCodeFetch = (
  url: string,
  init: {
    readonly method: "POST";
    readonly headers: Record<string, string>;
    readonly body: string;
  }
) => Promise<Response>;

type AuthCodeDeliveryInput = Parameters<AuthCodeDeliveryPort["deliverAuthCode"]>[0];

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

export class EmailAuthCodeDeliveryProvider implements AuthCodeDeliveryPort {
  constructor(
    private readonly options: AuthCodeHttpDeliveryOptions,
    private readonly fetchFn: AuthCodeFetch = fetch
  ) {}

  deliverAuthCode(input: AuthCodeDeliveryInput): Promise<AuthCodeDeliveryResult> {
    if (input.channel !== "email") {
      return Promise.resolve({
        provider: "email",
        status: "failed",
        errorCode: "EMAIL_DELIVERY_CHANNEL_MISMATCH",
        errorMessage: "Email auth code delivery only supports email challenges"
      });
    }

    return deliverHttpAuthCode({
      provider: "email",
      options: this.options,
      input,
      fetchFn: this.fetchFn
    });
  }
}

export class SmsAuthCodeDeliveryProvider implements AuthCodeDeliveryPort {
  constructor(
    private readonly options: AuthCodeHttpDeliveryOptions,
    private readonly fetchFn: AuthCodeFetch = fetch
  ) {}

  deliverAuthCode(input: AuthCodeDeliveryInput): Promise<AuthCodeDeliveryResult> {
    if (input.channel !== "phone") {
      return Promise.resolve({
        provider: "sms",
        status: "failed",
        errorCode: "SMS_DELIVERY_CHANNEL_MISMATCH",
        errorMessage: "SMS auth code delivery only supports phone challenges"
      });
    }

    return deliverHttpAuthCode({
      provider: "sms",
      options: this.options,
      input,
      fetchFn: this.fetchFn
    });
  }
}

export class ChannelAuthCodeDeliveryProvider implements AuthCodeDeliveryPort {
  constructor(
    private readonly emailDelivery: AuthCodeDeliveryPort,
    private readonly smsDelivery: AuthCodeDeliveryPort
  ) {}

  deliverAuthCode(input: AuthCodeDeliveryInput): Promise<AuthCodeDeliveryResult> {
    return input.channel === "email"
      ? this.emailDelivery.deliverAuthCode(input)
      : this.smsDelivery.deliverAuthCode(input);
  }
}

async function deliverHttpAuthCode(input: {
  readonly provider: "email" | "sms";
  readonly options: AuthCodeHttpDeliveryOptions;
  readonly input: AuthCodeDeliveryInput;
  readonly fetchFn: AuthCodeFetch;
}): Promise<AuthCodeDeliveryResult> {
  try {
    const response = await input.fetchFn(input.options.endpointUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.options.bearerToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        kind: "passwordless_auth_code",
        channel: input.input.channel,
        challengeId: input.input.challengeId,
        to: input.input.identifier,
        from: input.options.from,
        code: input.input.code,
        expiresAt: input.input.expiresAt
      })
    });

    if (!response.ok) {
      return {
        provider: input.provider,
        status: "failed",
        errorCode: `${input.provider.toUpperCase()}_DELIVERY_HTTP_${response.status}`,
        errorMessage: await normalizeDeliveryResponseErrorMessage(response)
      };
    }

    return {
      provider: input.provider,
      status: "sent",
      ...optionalProviderMessageId(await readProviderMessageId(response))
    };
  } catch (error) {
    return {
      provider: input.provider,
      status: "failed",
      errorCode: `${input.provider.toUpperCase()}_DELIVERY_EXCEPTION`,
      errorMessage: normalizeDeliveryExceptionMessage(error)
    };
  }
}

async function normalizeDeliveryResponseErrorMessage(response: Response): Promise<string> {
  const body = (await response.text()).trim();

  return (body || response.statusText || "Auth code delivery gateway failed").slice(0, 500);
}

async function readProviderMessageId(response: Response): Promise<string | undefined> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return undefined;
  }

  const body = await response.json() as unknown;

  if (isRecord(body) && typeof body.messageId === "string" && body.messageId.trim()) {
    return body.messageId.trim();
  }

  return undefined;
}

function normalizeDeliveryExceptionMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 500);
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim().slice(0, 500);
  }

  return "Auth code delivery gateway threw an unknown error";
}

function optionalProviderMessageId(
  providerMessageId: string | undefined
): { readonly providerMessageId: string } | Record<string, never> {
  return providerMessageId === undefined ? {} : { providerMessageId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
