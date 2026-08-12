import { describe, expect, it } from "vitest";

import { resolveClientLifecycleTransition } from "./client-lifecycle";

describe("client lifecycle transition policy", () => {
  it("moves an automatic new relationship to active after a captured order", () => {
    expect(
      resolveClientLifecycleTransition({
        current: {
          status: "new",
          mode: "automatic",
          latestAutomaticCandidateStatus: null
        },
        cause: {
          kind: "captured_order",
          occurredAt: "2026-08-13T10:00:00.000Z"
        }
      })
    ).toEqual({
      disposition: "applied",
      status: "active",
      mode: "automatic",
      latestAutomaticCandidateStatus: null
    });
  });

  it("records an automatic candidate without overriding an astrologer's manual status", () => {
    expect(
      resolveClientLifecycleTransition({
        current: {
          status: "inactive",
          mode: "manual_override",
          latestAutomaticCandidateStatus: null
        },
        cause: {
          kind: "inbound_message",
          occurredAt: "2026-08-13T10:00:00.000Z"
        }
      })
    ).toEqual({
      disposition: "candidate_recorded",
      status: "inactive",
      mode: "manual_override",
      latestAutomaticCandidateStatus: "active"
    });
  });

  it("returns to automatic mode by applying the recorded candidate", () => {
    expect(
      resolveClientLifecycleTransition({
        current: {
          status: "inactive",
          mode: "manual_override",
          latestAutomaticCandidateStatus: "active"
        },
        cause: {
          kind: "return_to_automatic",
          occurredAt: "2026-08-13T10:00:00.000Z"
        }
      })
    ).toEqual({
      disposition: "applied",
      status: "active",
      mode: "automatic",
      latestAutomaticCandidateStatus: null
    });
  });
});
