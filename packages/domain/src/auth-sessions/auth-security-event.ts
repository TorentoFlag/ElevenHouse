import { normalizeOptionalString } from "../shared";

export const authSecurityEventTypeValues = [
  "registration_succeeded",
  "login_succeeded",
  "login_failed",
  "logout_succeeded",
  "session_revoked"
] as const;

export type AuthSecurityEventType = (typeof authSecurityEventTypeValues)[number];

export type AuthSecurityEventMetadata = Record<string, string | number | boolean | null>;

export type AuthSecurityEvent = {
  readonly id: string;
  readonly eventType: AuthSecurityEventType;
  readonly occurredAt: string;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly metadata?: AuthSecurityEventMetadata;
};

export type AuthSecurityEventInput = {
  readonly eventType: AuthSecurityEventType;
  readonly occurredAt: Date;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly metadata?: AuthSecurityEventMetadata;
};

export type NormalizedAuthSecurityEventInput = Omit<AuthSecurityEvent, "id">;

export function normalizeAuthSecurityEventInput(
  input: AuthSecurityEventInput
): NormalizedAuthSecurityEventInput {
  const ipAddress = normalizeOptionalString(input.ipAddress);
  const userAgent = normalizeOptionalString(input.userAgent);

  return {
    eventType: input.eventType,
    occurredAt: input.occurredAt.toISOString(),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
}
