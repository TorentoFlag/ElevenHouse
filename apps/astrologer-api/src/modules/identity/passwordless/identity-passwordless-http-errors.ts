import { HttpException, HttpStatus } from "@nestjs/common";
import type { PasswordlessRateLimitDecision } from "./identity-passwordless.rate-limit";

export async function assertPasswordlessRateLimitAllowed(
  decision: PasswordlessRateLimitDecision
): Promise<void> {
  if (decision.allowed) {
    return;
  }

  throw new HttpException(
    {
      message: "Passwordless auth rate limit exceeded",
      retryAfterSeconds: decision.retryAfterSeconds
    },
    HttpStatus.TOO_MANY_REQUESTS
  );
}
