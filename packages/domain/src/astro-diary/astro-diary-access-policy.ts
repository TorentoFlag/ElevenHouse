export type AstroDiaryOperation =
  | "read"
  | "start_cycle"
  | "continue_open_cycle"
  | "respond_to_obligation"
  | "close"
  | "edit"
  | "erase";

export type AstroDiaryAccessAuthority = Readonly<{
  relationshipState: "active" | "archived" | "blocked";
  entitlementState: "active" | "ended" | "revoked";
  financeDenied: boolean;
  journalState: "active" | "erasing" | "erased";
  hasOpenCycle: boolean;
  hasOpenResponseObligation: boolean;
}>;

export type AstroDiaryAccessDecision =
  | Readonly<{ outcome: "allowed" }>
  | Readonly<{
      outcome: "denied";
      code:
        | "relationship_denied"
        | "journal_not_writable"
        | "finance_denied"
        | "paid_access_ended"
        | "no_open_cycle"
        | "no_open_response_obligation";
    }>;

export function authorizeAstroDiaryOperation(
  authority: AstroDiaryAccessAuthority,
  operation: AstroDiaryOperation
): AstroDiaryAccessDecision {
  if (operation === "erase") return { outcome: "allowed" };
  if (authority.relationshipState !== "active") {
    return { outcome: "denied", code: "relationship_denied" };
  }
  if (operation === "read") return { outcome: "allowed" };
  if (authority.journalState !== "active") {
    return { outcome: "denied", code: "journal_not_writable" };
  }
  if (authority.financeDenied || authority.entitlementState === "revoked") {
    return { outcome: "denied", code: "finance_denied" };
  }
  if (operation === "start_cycle") {
    return authority.entitlementState === "active"
      ? { outcome: "allowed" }
      : { outcome: "denied", code: "paid_access_ended" };
  }
  if (operation === "edit") {
    return authority.entitlementState === "active"
      ? { outcome: "allowed" }
      : { outcome: "denied", code: "paid_access_ended" };
  }
  if (operation === "continue_open_cycle" || operation === "close") {
    return authority.hasOpenCycle
      ? { outcome: "allowed" }
      : { outcome: "denied", code: "no_open_cycle" };
  }
  return authority.hasOpenResponseObligation
    ? { outcome: "allowed" }
    : { outcome: "denied", code: "no_open_response_obligation" };
}
