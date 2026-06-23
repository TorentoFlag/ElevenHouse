import { describe, expect, it } from "vitest";
import { formatResendCountdown, resolveResendCountdownSeconds } from "./resendCountdown";

describe("resendCountdown", () => {
  it("rounds up seconds until resend is available", () => {
    expect(
      resolveResendCountdownSeconds({
        nowMs: Date.parse("2026-06-16T10:00:10.250Z"),
        resendAvailableAt: "2026-06-16T10:01:00.000Z"
      })
    ).toBe(50);
  });

  it("returns zero when resend is already available", () => {
    expect(
      resolveResendCountdownSeconds({
        nowMs: Date.parse("2026-06-16T10:01:00.000Z"),
        resendAvailableAt: "2026-06-16T10:01:00.000Z"
      })
    ).toBe(0);
  });

  it("formats countdown as minutes and padded seconds", () => {
    expect(formatResendCountdown(62)).toBe("1:02");
    expect(formatResendCountdown(8)).toBe("0:08");
  });
});
