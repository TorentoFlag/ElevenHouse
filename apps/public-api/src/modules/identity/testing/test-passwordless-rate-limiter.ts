import type {
  PasswordlessRateLimitDecision,
  PasswordlessRateLimitOptions,
  PasswordlessRateLimitPort
} from "../passwordless/identity-passwordless.rate-limit";

type TestRateLimitBucket = {
  readonly key: string;
  readonly limit: number;
  readonly windowSeconds: number;
};

export class TestPasswordlessRateLimiter implements PasswordlessRateLimitPort {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly options: PasswordlessRateLimitOptions,
    private readonly now: () => Date
  ) {}

  consumeRequestCode(
    input: Parameters<PasswordlessRateLimitPort["consumeRequestCode"]>[0]
  ): Promise<PasswordlessRateLimitDecision> {
    return Promise.resolve(
      this.consume([
        {
          key: `request-code:identifier:${input.channel}:${input.identifier}`,
          ...this.options.requestCodeIdentifier
        },
        {
          key: `request-code:ip:${input.ipAddress}`,
          ...this.options.requestCodeIp
        },
        {
          key: `request-code:identifier-ip:${input.channel}:${input.identifier}:${input.ipAddress}`,
          ...this.options.requestCodeIdentifierIp
        }
      ])
    );
  }

  consumeVerifyCode(
    input: Parameters<PasswordlessRateLimitPort["consumeVerifyCode"]>[0]
  ): Promise<PasswordlessRateLimitDecision> {
    return Promise.resolve(
      this.consume([
        {
          key: `verify-code:challenge:${input.challengeId}`,
          ...this.options.verifyChallenge
        },
        {
          key: `verify-code:ip:${input.ipAddress}`,
          ...this.options.verifyIp
        }
      ])
    );
  }

  private consume(buckets: readonly TestRateLimitBucket[]): PasswordlessRateLimitDecision {
    const nowMs = this.now().getTime();
    const retryAfterSeconds = buckets
      .map((bucket) => this.checkBucket(bucket, nowMs))
      .filter((value): value is number => value !== null);

    if (retryAfterSeconds.length > 0) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(...retryAfterSeconds)
      };
    }

    for (const bucket of buckets) {
      const timestamps = this.getActiveTimestamps(bucket, nowMs);
      timestamps.push(nowMs);
      this.buckets.set(bucket.key, timestamps);
    }

    return { allowed: true };
  }

  private checkBucket(bucket: TestRateLimitBucket, nowMs: number): number | null {
    const timestamps = this.getActiveTimestamps(bucket, nowMs);
    this.buckets.set(bucket.key, timestamps);

    if (timestamps.length < bucket.limit) {
      return null;
    }

    const oldestTimestamp = timestamps[0] ?? nowMs;
    const retryAfterMs = oldestTimestamp + bucket.windowSeconds * 1000 - nowMs;

    return Math.max(1, Math.ceil(retryAfterMs / 1000));
  }

  private getActiveTimestamps(bucket: TestRateLimitBucket, nowMs: number): number[] {
    const cutoff = nowMs - bucket.windowSeconds * 1000;

    return (this.buckets.get(bucket.key) ?? []).filter((timestamp) => timestamp > cutoff);
  }
}
