import type { SessionJoinPolicy, SessionState } from "@elevenhouse/contracts/sessions";

export type SessionWebLocale = "ru" | "en";

export function createSessionPageModel(input: {
  readonly locale: SessionWebLocale;
  readonly state: SessionState;
  readonly joinPolicy: SessionJoinPolicy;
}) {
  const ru = input.locale === "ru";
  return {
    recordingLabel: ru ? "Без записи" : "Not recorded",
    joinLabel: ru ? "Войти в сессию" : "Join session",
    leaveLabel: ru ? "Выйти" : "Leave",
    endLabel: ru ? "Завершить для всех" : "End for everyone",
    canJoin: input.joinPolicy.kind === "allowed" && !["ended", "cancelled", "expired"].includes(input.state),
    joinableAt: input.joinPolicy.kind === "too_early" ? input.joinPolicy.joinableAt : null
  } as const;
}
