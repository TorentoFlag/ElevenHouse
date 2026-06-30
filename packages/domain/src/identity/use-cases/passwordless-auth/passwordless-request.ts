import type { Aes256GcmEncryptedSecret } from "@elevenhouse/auth";
import { normalizeOptionalString } from "../../../shared";
import {
  maskPasswordlessIdentifier,
  normalizePasswordlessIdentifier,
  normalizeRequestedCustomerRoles,
  PasswordlessCodeRequestCooldownError,
  type AuthChallenge,
  type AuthChallengeDelivery,
  type PasswordlessAuthChannel
} from "./passwordless-challenge";
import { hashPasswordlessCode } from "./passwordless-code";

export const authCodeDeliveryRequestedEventType = "identity.auth_code_delivery_requested";

export type AuthCodeDeliveryRequestedPayload = {
  readonly challengeId: string;
  readonly deliveryId: string;
  readonly channel: PasswordlessAuthChannel;
  readonly identifier: string;
  readonly encryptedCode: Aes256GcmEncryptedSecret;
  readonly expiresAt: string;
};

export type RedactedAuthCodeDeliveryRequestedPayload = Omit<
  AuthCodeDeliveryRequestedPayload,
  "encryptedCode"
> & {
  readonly codeRedactedAt: string;
};

export type AuthCodeEncryptionPort = {
  readonly encryptAuthCode: (input: {
    readonly challengeId: string;
    readonly deliveryId: string;
    readonly channel: PasswordlessAuthChannel;
    readonly identifier: string;
    readonly code: string;
    readonly expiresAt: string;
  }) => Aes256GcmEncryptedSecret;
};

export function createAuthCodeDeliveryEncryptionAad(input: {
  readonly challengeId: string;
  readonly deliveryId: string;
  readonly channel: PasswordlessAuthChannel;
  readonly identifier: string;
  readonly expiresAt: string;
}): string {
  return [
    authCodeDeliveryRequestedEventType,
    input.challengeId,
    input.deliveryId,
    input.channel,
    input.identifier,
    input.expiresAt
  ].join("|");
}

export type PasswordlessCodeRequestStore = {
  readonly findPendingChallengeByIdentifier: (input: {
    readonly channel: PasswordlessAuthChannel;
    readonly identifierNormalized: string;
  }) => Promise<AuthChallenge | null>;
  readonly findLatestDeliveryByChallengeId: (
    challengeId: string
  ) => Promise<AuthChallengeDelivery | null>;
  readonly createChallenge: (input: {
    readonly channel: PasswordlessAuthChannel;
    readonly identifier: string;
    readonly identifierNormalized: string;
    readonly codeHash: string;
    readonly requestedRoles: readonly ("client" | "astrologer")[];
    readonly maxAttempts: number;
    readonly expiresAt: string;
    readonly resendAvailableAt: string;
    readonly ipAddress?: string;
    readonly userAgent?: string;
  }) => Promise<AuthChallenge>;
  readonly recordDelivery: (input: {
    readonly challengeId: string;
    readonly provider?: string;
    readonly status: "queued" | "sent" | "failed";
    readonly providerMessageId?: string;
    readonly errorCode?: string;
    readonly errorMessage?: string;
    readonly sentAt?: string;
  }) => Promise<AuthChallengeDelivery>;
  readonly recordAuthCodeDeliveryRequested: (input: {
    readonly payload: AuthCodeDeliveryRequestedPayload;
    readonly occurredAt: string;
  }) => Promise<void>;
  readonly cancelChallenge: (input: {
    readonly challengeId: string;
    readonly cancelledAt: string;
  }) => Promise<void>;
};

export type RequestPasswordlessCodeResult = {
  readonly challengeId: string;
  readonly channel: PasswordlessAuthChannel;
  readonly maskedIdentifier: string;
  readonly expiresAt: string;
  readonly resendAvailableAt: string;
};

export async function requestPasswordlessCode(input: {
  readonly store: PasswordlessCodeRequestStore;
  readonly encryption: AuthCodeEncryptionPort;
  readonly channel: PasswordlessAuthChannel;
  readonly identifier: string;
  readonly roles: readonly string[];
  readonly code: string;
  readonly codeSecret: string;
  readonly now: Date;
  readonly ttlSeconds: number;
  readonly resendCooldownSeconds: number;
  readonly maxAttempts: number;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}): Promise<RequestPasswordlessCodeResult> {
  const { identifier, identifierNormalized } = normalizePasswordlessIdentifier({
    channel: input.channel,
    identifier: input.identifier
  });
  const requestedRoles = normalizeRequestedCustomerRoles(input.roles);
  const expiresAt = new Date(input.now.getTime() + input.ttlSeconds * 1000).toISOString();
  const resendAvailableAt = new Date(
    input.now.getTime() + input.resendCooldownSeconds * 1000
  ).toISOString();
  const existingPendingChallenge = await input.store.findPendingChallengeByIdentifier({
    channel: input.channel,
    identifierNormalized
  });

  if (existingPendingChallenge) {
    await assertCanReplacePendingChallenge({
      store: input.store,
      challenge: existingPendingChallenge,
      now: input.now
    });
  }

  const challenge = await input.store.createChallenge({
    channel: input.channel,
    identifier,
    identifierNormalized,
    codeHash: hashPasswordlessCode({
      secret: input.codeSecret,
      channel: input.channel,
      identifierNormalized,
      code: input.code
    }),
    requestedRoles,
    maxAttempts: input.maxAttempts,
    expiresAt,
    resendAvailableAt,
    ...optional("ipAddress", normalizeOptionalString(input.ipAddress)),
    ...optional("userAgent", normalizeOptionalString(input.userAgent))
  });

  const delivery = await input.store.recordDelivery({
    challengeId: challenge.id,
    status: "queued"
  });
  const deliveryPayload = {
    challengeId: challenge.id,
    deliveryId: delivery.id,
    channel: challenge.channel,
    identifier: challenge.identifierNormalized,
    expiresAt: challenge.expiresAt
  };
  await input.store.recordAuthCodeDeliveryRequested({
    payload: {
      ...deliveryPayload,
      encryptedCode: input.encryption.encryptAuthCode({
        ...deliveryPayload,
        code: input.code
      })
    },
    occurredAt: input.now.toISOString()
  });

  return {
    challengeId: challenge.id,
    channel: challenge.channel,
    maskedIdentifier: maskPasswordlessIdentifier({
      channel: challenge.channel,
      identifierNormalized: challenge.identifierNormalized
    }),
    expiresAt: challenge.expiresAt,
    resendAvailableAt: challenge.resendAvailableAt
  };
}

async function assertCanReplacePendingChallenge(input: {
  readonly store: PasswordlessCodeRequestStore;
  readonly challenge: AuthChallenge;
  readonly now: Date;
}): Promise<void> {
  const nowTime = input.now.getTime();
  const expiresAtTime = new Date(input.challenge.expiresAt).getTime();
  const resendAvailableAtTime = new Date(input.challenge.resendAvailableAt).getTime();

  if (expiresAtTime <= nowTime || resendAvailableAtTime <= nowTime) {
    await cancelPendingChallenge(input);
    return;
  }

  const latestDelivery = await input.store.findLatestDeliveryByChallengeId(input.challenge.id);

  if (latestDelivery?.status === "failed") {
    await cancelPendingChallenge(input);
    return;
  }

  throw new PasswordlessCodeRequestCooldownError(input.challenge.resendAvailableAt);
}

async function cancelPendingChallenge(input: {
  readonly store: PasswordlessCodeRequestStore;
  readonly challenge: AuthChallenge;
  readonly now: Date;
}): Promise<void> {
  await input.store.cancelChallenge({
    challengeId: input.challenge.id,
    cancelledAt: input.now.toISOString()
  });
}

function optional<K extends string, V>(
  key: K,
  value: V | undefined
): { readonly [P in K]: V } | Record<string, never> {
  return value === undefined ? {} : { [key]: value } as { readonly [P in K]: V };
}
