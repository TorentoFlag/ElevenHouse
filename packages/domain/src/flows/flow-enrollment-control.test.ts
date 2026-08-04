import { describe, expect, it } from "vitest";

import type {
  ActivateFlowVersionRequest,
  ActivateFlowVersionResponse,
  PauseFlowEnrollmentRequest,
  PauseFlowEnrollmentResponse
} from "@elevenhouse/contracts";

import * as flowEnrollmentControlModule from "./flow-enrollment-control";
import {
  activateFlowVersionEnrollment,
  pauseFlowEnrollment,
  type FlowActivationTargetVersion,
  type FlowActivationTransitionPlan,
  type FlowActivationTransactionalReadiness,
  type FlowEnrollmentAuthoritySnapshot,
  type FlowEnrollmentControlStore,
  type FlowEnrollmentPauseTransitionPlan,
  type FlowEnrollmentTransitionPreparation
} from "./flow-enrollment-control";

const ids = {
  actor: "00000000-0000-4000-8000-000000000001",
  owner: "00000000-0000-4000-8000-000000000002",
  flow: "00000000-0000-4000-8000-000000000003",
  version: "00000000-0000-4000-8000-000000000004",
  otherVersion: "00000000-0000-4000-8000-000000000005",
  epoch: "00000000-0000-4000-8000-000000000006"
} as const;

const inactiveAuthority: FlowEnrollmentAuthoritySnapshot = {
  flowId: ids.flow,
  ownerUserId: ids.owner,
  definitionState: "versioned",
  definitionRevision: 4,
  enrollmentState: "inactive",
  enrollmentRevision: 0,
  activeVersionId: null,
  activeActivationEpochId: null
};

const readyReadiness = transactionalReadiness();

describe("Flow enrollment control state machine", () => {
  it("keeps transactional readiness attestation and transition planners private", () => {
    expect(flowEnrollmentControlModule).not.toHaveProperty(
      "attestFlowActivationTransactionalReadiness"
    );
    expect(flowEnrollmentControlModule).not.toHaveProperty("planFlowActivationTransition");
    expect(flowEnrollmentControlModule).not.toHaveProperty("planFlowEnrollmentPauseTransition");
  });

  it("receives activation readiness only through the store preparation context", async () => {
    const store: FlowEnrollmentControlStore = {
      executeActivate: async (input) => {
        expect(input.request).not.toHaveProperty("readiness");
        expect(typeof input.prepare).toBe("function");
        expect(
          input.prepare({
            current: inactiveAuthority,
            target: currentTarget(),
            readiness: readyReadiness
          })
        ).toMatchObject({ kind: "accepted" });
        return {
          kind: "created",
          outcome: {
            kind: "rejected",
            response: { statusCode: 404, body: { code: "FLOW_DEFINITION_NOT_FOUND" } }
          }
        };
      },
      executePause: async () => {
        throw new Error("not used");
      }
    };

    await expect(
      activateFlowVersionEnrollment({
        store,
        actorUserId: ids.actor,
        ownerUserId: ids.owner,
        flowId: ids.flow,
        idempotencyKey: "flow-activate:transaction-context",
        request: activationRequest()
      })
    ).resolves.toMatchObject({ kind: "created", outcome: { kind: "rejected" } });
  });

  it("plans first activation without mutating definition lifecycle", async () => {
    expect(await prepareActivation()).toEqual({
      kind: "accepted",
      value: {
        closeActivationEpochId: null,
        targetVersionId: ids.version,
        nextEnrollmentRevision: 1,
        rolloutPolicyRevision: 3
      }
    });
  });

  it("switches versions by closing the current epoch at the same store-owned instant", async () => {
    expect(
      await prepareActivation({
        current: {
          ...inactiveAuthority,
          enrollmentState: "active",
          enrollmentRevision: 2,
          activeVersionId: ids.otherVersion,
          activeActivationEpochId: ids.epoch
        },
        readiness: transactionalReadiness({ enrollmentRevision: 2 }),
        request: activationRequest({
          expectedEnrollmentRevision: 2,
          expectedActiveVersionId: ids.otherVersion
        })
      })
    ).toMatchObject({
      kind: "accepted",
      value: {
        closeActivationEpochId: ids.epoch,
        targetVersionId: ids.version,
        nextEnrollmentRevision: 3
      }
    });
  });

  it("rejects stale definition, enrollment and active-version CAS independently", async () => {
    expect(
      await prepareActivation({ request: activationRequest({ expectedRevision: 3 }) })
    ).toMatchObject({
      kind: "rejected",
      response: { body: { code: "FLOW_DEFINITION_REVISION_CONFLICT" } }
    });
    expect(
      await prepareActivation({
        request: activationRequest({ expectedEnrollmentRevision: 1 })
      })
    ).toMatchObject({
      kind: "rejected",
      response: { body: { code: "FLOW_ENROLLMENT_REVISION_CONFLICT" } }
    });
    expect(
      await prepareActivation({
        request: activationRequest({ expectedActiveVersionId: ids.otherVersion })
      })
    ).toMatchObject({
      kind: "rejected",
      response: { body: { code: "FLOW_ACTIVE_VERSION_CONFLICT" } }
    });
  });

  it("rejects archived, legacy-manifest, already-active and readiness-blocked activation", async () => {
    expect(
      await prepareActivation({
        current: { ...inactiveAuthority, definitionState: "archived" }
      })
    ).toMatchObject({ kind: "rejected", response: { body: { code: "FLOW_DEFINITION_ARCHIVED" } } });
    expect(
      await prepareActivation({
        target: { ...currentTarget(), manifestSchemaVersion: "flow-capability-manifest.v1" }
      })
    ).toMatchObject({
      kind: "rejected",
      response: { body: { code: "FLOW_ACTIVATION_VERSION_UNSUPPORTED" } }
    });
    expect(
      await prepareActivation({
        current: {
          ...inactiveAuthority,
          enrollmentState: "active",
          enrollmentRevision: 1,
          activeVersionId: ids.version,
          activeActivationEpochId: ids.epoch
        },
        readiness: transactionalReadiness({ enrollmentRevision: 1 }),
        request: activationRequest({
          expectedEnrollmentRevision: 1,
          expectedActiveVersionId: ids.version
        })
      })
    ).toMatchObject({
      kind: "rejected",
      response: { body: { code: "FLOW_ACTIVATION_ALREADY_ACTIVE" } }
    });
    expect(
      await prepareActivation({
        readiness: transactionalReadiness({
          decision: "blocked",
          blockers: [
            {
              code: "FLOW_EXECUTION_WORKER_NOT_READY",
              path: "capabilities.completed:1:1",
              capabilityKey: "completed:1:1"
            }
          ]
        })
      })
    ).toMatchObject({
      kind: "rejected",
      response: { body: { code: "FLOW_ACTIVATION_BLOCKED" } }
    });
  });

  it("pauses only the exact active epoch and leaves definition revision out of the control CAS", async () => {
    const current: FlowEnrollmentAuthoritySnapshot = {
      ...inactiveAuthority,
      definitionRevision: 99,
      enrollmentState: "active",
      enrollmentRevision: 4,
      activeVersionId: ids.version,
      activeActivationEpochId: ids.epoch
    };
    expect(
      await preparePause({
        current,
        request: {
          schemaVersion: "flow-enrollment-pause-command.v1",
          expectedEnrollmentRevision: 4,
          expectedActiveVersionId: ids.version,
          expectedActivationEpochId: ids.epoch
        }
      })
    ).toEqual({
      kind: "accepted",
      value: { closeActivationEpochId: ids.epoch, nextEnrollmentRevision: 5 }
    });
    expect(
      await preparePause({
        current,
        request: {
          schemaVersion: "flow-enrollment-pause-command.v1",
          expectedEnrollmentRevision: 4,
          expectedActiveVersionId: ids.version,
          expectedActivationEpochId: ids.otherVersion
        }
      })
    ).toMatchObject({
      kind: "rejected",
      response: { body: { code: "FLOW_ACTIVE_EPOCH_CONFLICT" } }
    });
    expect(
      await preparePause({
        current: inactiveAuthority,
        request: {
          schemaVersion: "flow-enrollment-pause-command.v1",
          expectedEnrollmentRevision: 0,
          expectedActiveVersionId: ids.version,
          expectedActivationEpochId: ids.epoch
        }
      })
    ).toMatchObject({
      kind: "rejected",
      response: { body: { code: "FLOW_ENROLLMENT_NOT_ACTIVE" } }
    });
  });

  it("fails closed on impossible projections, cross-owner targets and mismatched readiness", async () => {
    await expect(
      prepareActivation({
        current: {
          ...inactiveAuthority,
          enrollmentState: "active",
          activeVersionId: ids.version
        },
        request: activationRequest({ expectedActiveVersionId: ids.version })
      })
    ).rejects.toThrow("Persisted flow enrollment authority is inconsistent");
    await expect(prepareActivation({ ownerUserId: ids.actor })).rejects.toThrow(
      "Persisted flow enrollment authority is inconsistent"
    );
    await expect(
      prepareActivation({ target: { ...currentTarget(), ownerUserId: ids.actor } })
    ).rejects.toThrow("Persisted flow enrollment authority is inconsistent");
    await expect(
      prepareActivation({ readiness: transactionalReadiness({ enrollmentRevision: 1 }) })
    ).rejects.toThrow("Persisted flow enrollment authority is inconsistent");
    await expect(
      prepareActivation({
        readiness: {
          ...readyReadiness,
          schemaVersion: "flow-activation-review.v1" as never
        }
      })
    ).rejects.toThrow("Persisted flow enrollment authority is inconsistent");
  });

  it("builds a stable command identity and binds every CAS field into the request hash", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const store: FlowEnrollmentControlStore = {
      executeActivate: async (input) => {
        captured.push(input.command);
        return {
          kind: "created",
          outcome: {
            kind: "rejected",
            response: { statusCode: 404, body: { code: "FLOW_DEFINITION_NOT_FOUND" } }
          }
        };
      },
      executePause: async () => {
        throw new Error("not used");
      }
    };
    await activateFlowVersionEnrollment({
      store,
      actorUserId: ` ${ids.actor} `,
      ownerUserId: ids.owner,
      flowId: ids.flow,
      idempotencyKey: " flow-activate:1 ",
      request: activationRequest()
    });
    await activateFlowVersionEnrollment({
      store,
      actorUserId: ids.actor,
      ownerUserId: ids.owner,
      flowId: ids.flow,
      idempotencyKey: "flow-activate:2",
      request: activationRequest()
    });
    await activateFlowVersionEnrollment({
      store,
      actorUserId: ids.actor,
      ownerUserId: ids.owner,
      flowId: ids.flow,
      idempotencyKey: "flow-activate:3",
      request: activationRequest({ expectedEnrollmentRevision: 1 })
    });
    await activateFlowVersionEnrollment({
      store,
      actorUserId: ids.actor,
      ownerUserId: ids.owner,
      flowId: ids.flow,
      idempotencyKey: "flow-activate:4",
      request: activationRequest({ versionId: ids.otherVersion })
    });
    await activateFlowVersionEnrollment({
      store,
      actorUserId: ids.actor,
      ownerUserId: ids.owner,
      flowId: ids.flow,
      idempotencyKey: "flow-activate:5",
      request: activationRequest({ expectedRevision: 5 })
    });
    await activateFlowVersionEnrollment({
      store,
      actorUserId: ids.actor,
      ownerUserId: ids.owner,
      flowId: ids.flow,
      idempotencyKey: "flow-activate:6",
      request: activationRequest({ expectedActiveVersionId: ids.otherVersion })
    });
    await activateFlowVersionEnrollment({
      store,
      actorUserId: ids.owner,
      ownerUserId: ids.owner,
      flowId: ids.flow,
      idempotencyKey: "flow-activate:7",
      request: activationRequest()
    });
    await activateFlowVersionEnrollment({
      store,
      actorUserId: ids.actor,
      ownerUserId: ids.actor,
      flowId: ids.flow,
      idempotencyKey: "flow-activate:8",
      request: activationRequest()
    });
    await activateFlowVersionEnrollment({
      store,
      actorUserId: ids.actor,
      ownerUserId: ids.owner,
      flowId: ids.otherVersion,
      idempotencyKey: "flow-activate:9",
      request: activationRequest()
    });

    expect(captured[0]).toMatchObject({
      apiSurface: "astrologer-api",
      routeTemplate: "/flows/:flowId/activate",
      scope: "flows.enrollment.activate.v1",
      actorUserId: ids.actor,
      ownerUserId: ids.owner,
      resourceId: ids.flow,
      idempotencyKey: "flow-activate:1"
    });
    expect(captured[0]?.requestHash).toBe(captured[1]?.requestHash);
    for (const changedIdentity of captured.slice(2)) {
      expect(changedIdentity.requestHash).not.toBe(captured[0]?.requestHash);
    }
  });

  it("runtime-validates and command-binds created or replayed store outcomes", async () => {
    const validStore = activationStore(activationResponse(), "replayed");
    await expect(
      activateFlowVersionEnrollment({
        store: validStore,
        actorUserId: ids.actor,
        ownerUserId: ids.owner,
        flowId: ids.flow,
        idempotencyKey: "flow-activate:valid",
        request: activationRequest()
      })
    ).resolves.toMatchObject({ kind: "replayed", outcome: { kind: "succeeded" } });

    await expect(
      activateFlowVersionEnrollment({
        store: activationStore(activationResponse({ flowId: ids.otherVersion }), "replayed"),
        actorUserId: ids.actor,
        ownerUserId: ids.owner,
        flowId: ids.flow,
        idempotencyKey: "flow-activate:foreign",
        request: activationRequest()
      })
    ).rejects.toMatchObject({ code: "FLOW_ENROLLMENT_AUTHORITY_INTEGRITY_ERROR" });

    await expect(
      pauseFlowEnrollment({
        store: pauseStore(pauseResponse({ closedEpochId: ids.otherVersion }), "replayed"),
        actorUserId: ids.actor,
        ownerUserId: ids.owner,
        flowId: ids.flow,
        idempotencyKey: "flow-pause:foreign",
        request: pauseRequest()
      })
    ).rejects.toMatchObject({ code: "FLOW_ENROLLMENT_AUTHORITY_INTEGRITY_ERROR" });

    const malformedStore: FlowEnrollmentControlStore = {
      executeActivate: async () =>
        ({ kind: "replayed", outcome: { kind: "succeeded", response: {} } }) as never,
      executePause: async () => {
        throw new Error("not used");
      }
    };
    await expect(
      activateFlowVersionEnrollment({
        store: malformedStore,
        actorUserId: ids.actor,
        ownerUserId: ids.owner,
        flowId: ids.flow,
        idempotencyKey: "flow-activate:malformed",
        request: activationRequest()
      })
    ).rejects.toMatchObject({ code: "FLOW_ENROLLMENT_AUTHORITY_INTEGRITY_ERROR" });
  });

  it("rejects a newly created success that bypasses transactional preparation", async () => {
    await expect(
      activateFlowVersionEnrollment({
        store: activationStore(activationResponse(), "created"),
        actorUserId: ids.actor,
        ownerUserId: ids.owner,
        flowId: ids.flow,
        idempotencyKey: "flow-activate:bypassed-prepare",
        request: activationRequest()
      })
    ).rejects.toMatchObject({ code: "FLOW_ENROLLMENT_AUTHORITY_INTEGRITY_ERROR" });

    await expect(
      pauseFlowEnrollment({
        store: pauseStore(pauseResponse(), "created"),
        actorUserId: ids.actor,
        ownerUserId: ids.owner,
        flowId: ids.flow,
        idempotencyKey: "flow-pause:bypassed-prepare",
        request: pauseRequest()
      })
    ).rejects.toMatchObject({ code: "FLOW_ENROLLMENT_AUTHORITY_INTEGRITY_ERROR" });
  });

  it("keeps exact replay read-only and makes preparation one-shot", async () => {
    const replayWithPreparation: FlowEnrollmentControlStore = {
      executeActivate: async (input) => {
        input.prepare({
          current: inactiveAuthority,
          target: currentTarget(),
          readiness: readyReadiness
        });
        return {
          kind: "replayed",
          outcome: {
            kind: "succeeded",
            response: { statusCode: 200, body: activationResponse() }
          }
        };
      },
      executePause: async () => {
        throw new Error("not used");
      }
    };
    await expect(
      activateFlowVersionEnrollment({
        store: replayWithPreparation,
        actorUserId: ids.actor,
        ownerUserId: ids.owner,
        flowId: ids.flow,
        idempotencyKey: "flow-activate:replay-prepared",
        request: activationRequest()
      })
    ).rejects.toMatchObject({ code: "FLOW_ENROLLMENT_AUTHORITY_INTEGRITY_ERROR" });

    const doublePreparation: FlowEnrollmentControlStore = {
      executeActivate: async (input) => {
        const context = {
          current: inactiveAuthority,
          target: currentTarget(),
          readiness: readyReadiness
        };
        input.prepare(context);
        input.prepare(context);
        throw new Error("unreachable");
      },
      executePause: async () => {
        throw new Error("not used");
      }
    };
    await expect(
      activateFlowVersionEnrollment({
        store: doublePreparation,
        actorUserId: ids.actor,
        ownerUserId: ids.owner,
        flowId: ids.flow,
        idempotencyKey: "flow-activate:double-prepare",
        request: activationRequest()
      })
    ).rejects.toMatchObject({ code: "FLOW_ENROLLMENT_AUTHORITY_INTEGRITY_ERROR" });
  });

  it("keeps missing and foreign-owner command responses indistinguishable", async () => {
    const store: FlowEnrollmentControlStore = {
      executeActivate: async () => ({
        kind: "created",
        outcome: {
          kind: "rejected",
          response: { statusCode: 404, body: { code: "FLOW_DEFINITION_NOT_FOUND" } }
        }
      }),
      executePause: async () => {
        throw new Error("not used");
      }
    };
    const invoke = (ownerUserId: string, key: string) =>
      activateFlowVersionEnrollment({
        store,
        actorUserId: ownerUserId,
        ownerUserId,
        flowId: ids.flow,
        idempotencyKey: key,
        request: activationRequest()
      });

    const missing = await invoke(ids.owner, "flow-activate:missing");
    const foreign = await invoke(ids.actor, "flow-activate:foreign-owner");
    expect(foreign.outcome).toEqual(missing.outcome);
  });

  it("requires a strong idempotency key for activation and pause commands", async () => {
    const store: FlowEnrollmentControlStore = {
      executeActivate: async () => {
        throw new Error("must not execute");
      },
      executePause: async () => {
        throw new Error("must not execute");
      }
    };
    await expect(
      activateFlowVersionEnrollment({
        store,
        actorUserId: ids.actor,
        ownerUserId: ids.owner,
        flowId: ids.flow,
        idempotencyKey: "short",
        request: activationRequest()
      })
    ).rejects.toMatchObject({ code: "FLOW_IDEMPOTENCY_KEY_INVALID" });
    await expect(
      pauseFlowEnrollment({
        store,
        actorUserId: ids.actor,
        ownerUserId: ids.owner,
        flowId: ids.flow,
        idempotencyKey: "short",
        request: {
          schemaVersion: "flow-enrollment-pause-command.v1",
          expectedEnrollmentRevision: 1,
          expectedActiveVersionId: ids.version,
          expectedActivationEpochId: ids.epoch
        }
      })
    ).rejects.toMatchObject({ code: "FLOW_IDEMPOTENCY_KEY_INVALID" });
  });
});

function activationRequest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "flow-activation-command.v1" as const,
    versionId: ids.version,
    expectedRevision: 4,
    expectedEnrollmentRevision: 0,
    expectedActiveVersionId: null,
    ...overrides
  };
}

function transactionalReadiness(
  overrides: Partial<FlowActivationTransactionalReadiness> = {}
): FlowActivationTransactionalReadiness {
  return {
    schemaVersion: "flow-activation-transaction-readiness.v1",
    flowId: ids.flow,
    versionId: ids.version,
    definitionRevision: 4,
    enrollmentRevision: 0,
    runtimeMode: "canary",
    rolloutPolicyRevision: 3,
    checkedAt: "2026-08-04T10:00:00.000Z",
    decision: "ready",
    blockers: [],
    ...overrides
  };
}

function pauseRequest() {
  return {
    schemaVersion: "flow-enrollment-pause-command.v1" as const,
    expectedEnrollmentRevision: 1,
    expectedActiveVersionId: ids.version,
    expectedActivationEpochId: ids.epoch
  };
}

function currentTarget() {
  return {
    id: ids.version,
    flowId: ids.flow,
    ownerUserId: ids.owner,
    graphSchemaVersion: "flow-graph.v2" as const,
    manifestSchemaVersion: "flow-capability-manifest.v2" as const
  };
}

async function prepareActivation(
  options: {
    readonly current?: FlowEnrollmentAuthoritySnapshot;
    readonly target?: FlowActivationTargetVersion;
    readonly readiness?: FlowActivationTransactionalReadiness;
    readonly request?: ActivateFlowVersionRequest;
    readonly ownerUserId?: string;
    readonly flowId?: string;
  } = {}
): Promise<FlowEnrollmentTransitionPreparation<FlowActivationTransitionPlan>> {
  let prepared: FlowEnrollmentTransitionPreparation<FlowActivationTransitionPlan> | undefined;
  const request = options.request ?? activationRequest();
  const store: FlowEnrollmentControlStore = {
    executeActivate: async (input) => {
      prepared = input.prepare({
        current: options.current ?? inactiveAuthority,
        target: options.target ?? currentTarget(),
        readiness: options.readiness ?? readyReadiness
      });
      return {
        kind: "created",
        outcome: {
          kind: "rejected",
          response: { statusCode: 404, body: { code: "FLOW_DEFINITION_NOT_FOUND" } }
        }
      };
    },
    executePause: async () => {
      throw new Error("not used");
    }
  };

  await activateFlowVersionEnrollment({
    store,
    actorUserId: ids.actor,
    ownerUserId: options.ownerUserId ?? ids.owner,
    flowId: options.flowId ?? ids.flow,
    idempotencyKey: "flow-activate:prepare",
    request
  });
  if (prepared === undefined) throw new Error("Activation preparation was not invoked");
  return prepared;
}

async function preparePause(options: {
  readonly current: FlowEnrollmentAuthoritySnapshot;
  readonly request: PauseFlowEnrollmentRequest;
}): Promise<FlowEnrollmentTransitionPreparation<FlowEnrollmentPauseTransitionPlan>> {
  let prepared: FlowEnrollmentTransitionPreparation<FlowEnrollmentPauseTransitionPlan> | undefined;
  const store: FlowEnrollmentControlStore = {
    executeActivate: async () => {
      throw new Error("not used");
    },
    executePause: async (input) => {
      prepared = input.prepare({ current: options.current });
      return {
        kind: "created",
        outcome: {
          kind: "rejected",
          response: { statusCode: 404, body: { code: "FLOW_DEFINITION_NOT_FOUND" } }
        }
      };
    }
  };

  await pauseFlowEnrollment({
    store,
    actorUserId: ids.actor,
    ownerUserId: ids.owner,
    flowId: ids.flow,
    idempotencyKey: "flow-pause:prepare",
    request: options.request
  });
  if (prepared === undefined) throw new Error("Pause preparation was not invoked");
  return prepared;
}

function activationResponse(
  overrides: { readonly flowId?: string } = {}
): ActivateFlowVersionResponse {
  const flowId = overrides.flowId ?? ids.flow;
  return {
    schemaVersion: "flow-activation-result.v1",
    enrollment: {
      schemaVersion: "flow-enrollment-control.v1",
      flowId,
      state: "active",
      definitionRevision: 4,
      enrollmentRevision: 1,
      activeVersionId: ids.version,
      activeActivationEpochId: ids.epoch,
      activeSince: "2026-08-04T10:00:00.000Z",
      lastPausedAt: null
    },
    activationEpoch: {
      schemaVersion: "flow-activation-epoch.v1",
      id: ids.epoch,
      flowId,
      flowVersionId: ids.version,
      sequence: 1,
      effectiveFrom: "2026-08-04T10:00:00.000Z",
      effectiveTo: null,
      manifestDigest: `sha256:${"a".repeat(64)}`,
      rolloutPolicyRevision: 3,
      activatedByActorUserId: ids.actor,
      activateCommandId: "00000000-0000-4000-8000-000000000007",
      closeReason: null,
      closedByActorUserId: null,
      closeCommandId: null
    }
  };
}

function pauseResponse(
  overrides: { readonly closedEpochId?: string } = {}
): PauseFlowEnrollmentResponse {
  const pausedAt = "2026-08-04T11:00:00.000Z";
  return {
    schemaVersion: "flow-enrollment-pause-result.v1",
    enrollment: {
      schemaVersion: "flow-enrollment-control.v1",
      flowId: ids.flow,
      state: "paused",
      definitionRevision: 9,
      enrollmentRevision: 2,
      activeVersionId: null,
      activeActivationEpochId: null,
      activeSince: null,
      lastPausedAt: pausedAt
    },
    closedEpoch: {
      schemaVersion: "flow-activation-epoch.v1",
      id: overrides.closedEpochId ?? ids.epoch,
      flowId: ids.flow,
      flowVersionId: ids.version,
      sequence: 1,
      effectiveFrom: "2026-08-04T10:00:00.000Z",
      effectiveTo: pausedAt,
      manifestDigest: `sha256:${"a".repeat(64)}`,
      rolloutPolicyRevision: 3,
      activatedByActorUserId: ids.actor,
      activateCommandId: "00000000-0000-4000-8000-000000000007",
      closeReason: "pause_enrollment",
      closedByActorUserId: ids.actor,
      closeCommandId: "00000000-0000-4000-8000-000000000008"
    }
  };
}

function activationStore(
  response: ActivateFlowVersionResponse,
  kind: "created" | "replayed"
): FlowEnrollmentControlStore {
  return {
    executeActivate: async () => ({
      kind,
      outcome: { kind: "succeeded", response: { statusCode: 200, body: response } }
    }),
    executePause: async () => {
      throw new Error("not used");
    }
  };
}

function pauseStore(
  response: PauseFlowEnrollmentResponse,
  kind: "created" | "replayed"
): FlowEnrollmentControlStore {
  return {
    executeActivate: async () => {
      throw new Error("not used");
    },
    executePause: async () => ({
      kind,
      outcome: { kind: "succeeded", response: { statusCode: 200, body: response } }
    })
  };
}
