import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { AuthCodeHttpDeliveryOptions, AuthCodeSmtpDeliveryOptions } from "./runtime-config";

export type AuthCodeDeliveryInput = {
  readonly challengeId: string;
  readonly deliveryId: string;
  readonly outboxEventId: string;
  readonly channel: "email" | "phone";
  readonly identifier: string;
  readonly code: string;
  readonly expiresAt: string;
};

export type AuthCodeDeliveryResult = {
  readonly provider: "email" | "sms" | "dev_console";
  readonly status: "sent" | "failed";
  readonly providerStatusCode?: number;
  readonly providerMessageId?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
};

export type AuthCodeDeliveryProvider = {
  readonly deliverAuthCode: (input: AuthCodeDeliveryInput) => Promise<AuthCodeDeliveryResult>;
};

type AuthCodeFetch = (
  url: string,
  init: {
    readonly method: "POST";
    readonly headers: Record<string, string>;
    readonly body: string;
  }
) => Promise<Response>;

type SmtpAuthCodeTransport = {
  readonly sendMail: (message: SmtpAuthCodeMessage) => Promise<SmtpAuthCodeSendResult>;
};

type SmtpAuthCodeMessage = {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
};

type SmtpAuthCodeSendResult = {
  readonly messageId?: string;
};

export class SmtpEmailAuthCodeDeliveryProvider implements AuthCodeDeliveryProvider {
  constructor(
    private readonly options: AuthCodeSmtpDeliveryOptions,
    private readonly transport: SmtpAuthCodeTransport = createSmtpAuthCodeTransport(options)
  ) {}

  async deliverAuthCode(input: AuthCodeDeliveryInput): Promise<AuthCodeDeliveryResult> {
    if (input.channel !== "email") {
      return Promise.resolve({
        provider: "email",
        status: "failed",
        errorCode: "EMAIL_DELIVERY_CHANNEL_MISMATCH",
        errorMessage: "Email auth code delivery only supports email challenges"
      });
    }

    try {
      const result = await this.transport.sendMail(createEmailAuthCodeMessage(this.options, input));

      return {
        provider: "email",
        status: "sent",
        ...optionalProviderMessageId(normalizeOptionalProviderMessageId(result.messageId))
      };
    } catch (error) {
      return {
        provider: "email",
        status: "failed",
        errorCode: "EMAIL_DELIVERY_SMTP_EXCEPTION",
        errorMessage: normalizeDeliveryExceptionMessage(error)
      };
    }
  }
}

export class SmsAuthCodeDeliveryProvider implements AuthCodeDeliveryProvider {
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

export class UnconfiguredSmsAuthCodeDeliveryProvider implements AuthCodeDeliveryProvider {
  deliverAuthCode(input: AuthCodeDeliveryInput): Promise<AuthCodeDeliveryResult> {
    if (input.channel !== "phone") {
      return Promise.resolve({
        provider: "sms",
        status: "failed",
        errorCode: "SMS_DELIVERY_CHANNEL_MISMATCH",
        errorMessage: "SMS auth code delivery only supports phone challenges"
      });
    }

    return Promise.resolve({
      provider: "sms",
      status: "failed",
      errorCode: "SMS_DELIVERY_PROVIDER_NOT_CONFIGURED",
      errorMessage: "SMS auth code delivery provider is not configured"
    });
  }
}

export class ChannelAuthCodeDeliveryProvider implements AuthCodeDeliveryProvider {
  constructor(
    private readonly emailDelivery: AuthCodeDeliveryProvider,
    private readonly smsDelivery: AuthCodeDeliveryProvider
  ) {}

  deliverAuthCode(input: AuthCodeDeliveryInput): Promise<AuthCodeDeliveryResult> {
    return input.channel === "email"
      ? this.emailDelivery.deliverAuthCode(input)
      : this.smsDelivery.deliverAuthCode(input);
  }
}

export class DevConsoleAuthCodeDeliveryProvider implements AuthCodeDeliveryProvider {
  constructor(
    private readonly logger: {
      readonly info: (message: string, context: Record<string, unknown>) => void;
    }
  ) {}

  deliverAuthCode(input: AuthCodeDeliveryInput): Promise<AuthCodeDeliveryResult> {
    this.logger.info("dev console auth code delivery", {
      challengeId: input.challengeId,
      deliveryId: input.deliveryId,
      outboxEventId: input.outboxEventId,
      channel: input.channel,
      identifier: input.identifier,
      code: input.code,
      expiresAt: input.expiresAt
    });

    return Promise.resolve({
      provider: "dev_console",
      status: "sent",
      providerMessageId: `dev-console-${input.deliveryId}`
    });
  }
}

function createSmtpAuthCodeTransport(options: AuthCodeSmtpDeliveryOptions): SmtpAuthCodeTransport {
  const transport = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: {
      user: options.user,
      pass: options.password
    }
  });

  return {
    sendMail: (message) => transport.sendMail(message) as Promise<SMTPTransport.SentMessageInfo>
  };
}

function createEmailAuthCodeMessage(
  options: AuthCodeSmtpDeliveryOptions,
  input: AuthCodeDeliveryInput
): SmtpAuthCodeMessage {
  return {
    from: options.from,
    to: input.identifier,
    subject: "Your ElevenHouse sign-in code",
    text: `Your ElevenHouse sign-in code is ${input.code}.`,
    html: `<p>Your ElevenHouse sign-in code is <strong>${input.code}</strong>.</p>`
  };
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
        "content-type": "application/json",
        "idempotency-key": input.input.deliveryId
      },
      body: JSON.stringify({
        kind: "passwordless_auth_code",
        channel: input.input.channel,
        challengeId: input.input.challengeId,
        deliveryId: input.input.deliveryId,
        outboxEventId: input.input.outboxEventId,
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
        providerStatusCode: response.status,
        errorCode: `${input.provider.toUpperCase()}_DELIVERY_HTTP_${response.status}`,
        errorMessage: await normalizeDeliveryResponseErrorMessage(response)
      };
    }

    return {
      provider: input.provider,
      status: "sent",
      providerStatusCode: response.status,
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

function normalizeOptionalProviderMessageId(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
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

  const body = (await response.json()) as unknown;

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
