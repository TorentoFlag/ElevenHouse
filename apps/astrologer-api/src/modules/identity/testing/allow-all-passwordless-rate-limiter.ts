import type { PasswordlessRateLimitPort } from "../passwordless/identity-passwordless.rate-limit";

export const allowAllPasswordlessRateLimiter: PasswordlessRateLimitPort = {
  consumeRequestCode: async () => ({ allowed: true }),
  consumeVerifyCode: async () => ({ allowed: true }),
  consumeMobileRefresh: async () => ({ allowed: true })
};
