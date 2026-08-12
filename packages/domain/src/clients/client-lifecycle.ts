export const clientLifecycleStatusValues = [
  "new",
  "active",
  "waiting_for_client",
  "in_service",
  "inactive"
] as const;
export type ClientLifecycleStatus = (typeof clientLifecycleStatusValues)[number];

export const clientLifecycleModeValues = ["automatic", "manual_override"] as const;
export type ClientLifecycleMode = (typeof clientLifecycleModeValues)[number];

export const clientLifecycleCauseKindValues = [
  "relationship_created",
  "captured_order",
  "inbound_message",
  "booking_started",
  "booking_completed",
  "inactivity_elapsed",
  "manual_astrologer_action",
  "manual_override",
  "return_to_automatic"
] as const;
export type ClientLifecycleCauseKind = (typeof clientLifecycleCauseKindValues)[number];

export type ClientLifecycleTransitionInput = {
  readonly current: {
    readonly status: ClientLifecycleStatus;
    readonly mode: ClientLifecycleMode;
    readonly latestAutomaticCandidateStatus: ClientLifecycleStatus | null;
  };
  readonly cause: {
    readonly kind: ClientLifecycleCauseKind;
    readonly occurredAt: string;
    readonly manualStatus?: ClientLifecycleStatus;
  };
};

export type ClientLifecycleTransitionDecision = {
  readonly disposition: "applied" | "candidate_recorded" | "no_change";
  readonly status: ClientLifecycleStatus;
  readonly mode: ClientLifecycleMode;
  readonly latestAutomaticCandidateStatus: ClientLifecycleStatus | null;
};

const automaticTargetByCause: Readonly<
  Partial<Record<ClientLifecycleCauseKind, ClientLifecycleStatus>>
> = {
  relationship_created: "new",
  captured_order: "active",
  inbound_message: "active",
  booking_started: "in_service",
  booking_completed: "active",
  inactivity_elapsed: "inactive",
  manual_astrologer_action: "active"
};

export function resolveClientLifecycleTransition(
  input: ClientLifecycleTransitionInput
): ClientLifecycleTransitionDecision {
  if (!Number.isFinite(Date.parse(input.cause.occurredAt))) {
    throw new TypeError("Client lifecycle transition requires a valid occurrence time");
  }

  if (input.cause.kind === "manual_override") {
    if (!input.cause.manualStatus) {
      throw new TypeError("Manual client lifecycle override requires a target status");
    }
    return {
      disposition: "applied",
      status: input.cause.manualStatus,
      mode: "manual_override",
      latestAutomaticCandidateStatus: input.current.latestAutomaticCandidateStatus
    };
  }

  if (input.cause.kind === "return_to_automatic") {
    const status = input.current.latestAutomaticCandidateStatus ?? input.current.status;
    return {
      disposition: status === input.current.status && input.current.mode === "automatic" ? "no_change" : "applied",
      status,
      mode: "automatic",
      latestAutomaticCandidateStatus: null
    };
  }

  const target = automaticTargetByCause[input.cause.kind];
  if (!target) {
    throw new TypeError(`Client lifecycle cause is not automatic: ${input.cause.kind}`);
  }
  if (input.current.mode === "manual_override") {
    return {
      disposition: "candidate_recorded",
      status: input.current.status,
      mode: "manual_override",
      latestAutomaticCandidateStatus: target
    };
  }
  return {
    disposition: target === input.current.status ? "no_change" : "applied",
    status: target,
    mode: "automatic",
    latestAutomaticCandidateStatus: null
  };
}
