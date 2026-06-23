import { useCallback, useEffect, useState } from "react";
import {
  formatResendCountdown,
  resolveResendCountdownSeconds
} from "../helpers/resendCountdown";

export function useResendCountdown(input: {
  readonly isActive: boolean;
  readonly resendAvailableAt: string | null | undefined;
  readonly labelTemplate: string;
  readonly tickMs: number;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const resendCountdownSeconds =
    input.isActive && input.resendAvailableAt
      ? resolveResendCountdownSeconds({
          nowMs,
          resendAvailableAt: input.resendAvailableAt
        })
      : 0;
  const resendCooldownLabel =
    resendCountdownSeconds > 0
      ? input.labelTemplate.replace("{time}", formatResendCountdown(resendCountdownSeconds))
      : null;

  const resetResendCountdown = useCallback(() => {
    setNowMs(Date.now());
  }, []);

  useEffect(() => {
    if (!input.isActive || !input.resendAvailableAt) {
      return undefined;
    }

    setNowMs(Date.now());

    const intervalId = globalThis.setInterval(() => {
      setNowMs(Date.now());
    }, input.tickMs);

    return () => {
      globalThis.clearInterval(intervalId);
    };
  }, [input.isActive, input.resendAvailableAt, input.tickMs]);

  return {
    resendCountdownSeconds,
    resendCooldownLabel,
    resetResendCountdown
  };
}
