import {
  FlowRuntimeControlIntegrityError,
  verifyFlowRuntimeRolloutPolicyEvidence,
  type FlowRuntimeControlReader,
  type FlowRuntimeRolloutPolicy
} from "@elevenhouse/domain";
import { eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { flowRuntimeControlAuthority, flowRuntimeRolloutPolicyVersions } from "../../schema/flows";

export type FlowRuntimeControlTransaction = Parameters<
  Parameters<ElevenHouseDatabase["transaction"]>[0]
>[0];

export function createDrizzleFlowRuntimeControlReader(
  database: ElevenHouseDatabase
): FlowRuntimeControlReader {
  return Object.freeze({
    readCurrent: () =>
      database.transaction((transaction) => readCurrentFlowRuntimeControl(transaction))
  });
}

export async function readCurrentFlowRuntimeControl(
  transaction: FlowRuntimeControlTransaction,
  options: { readonly lockRows?: boolean } = {}
): Promise<FlowRuntimeRolloutPolicy> {
  const query = transaction
    .select({
      authorityKey: flowRuntimeControlAuthority.authorityKey,
      currentPolicyRevision: flowRuntimeControlAuthority.currentPolicyRevision,
      controlRevision: flowRuntimeControlAuthority.controlRevision,
      revision: flowRuntimeRolloutPolicyVersions.revision,
      schemaVersion: flowRuntimeRolloutPolicyVersions.schemaVersion,
      mode: flowRuntimeRolloutPolicyVersions.mode,
      canaryOwnerSubjectIds: flowRuntimeRolloutPolicyVersions.canaryOwnerSubjectIds,
      allowedRequirementKeys: flowRuntimeRolloutPolicyVersions.allowedRequirementKeys,
      enrollmentGlobalKillSwitch: flowRuntimeRolloutPolicyVersions.enrollmentGlobalKillSwitch,
      claimGlobalKillSwitch: flowRuntimeRolloutPolicyVersions.claimGlobalKillSwitch,
      externalDispatchGlobalKillSwitch:
        flowRuntimeRolloutPolicyVersions.externalDispatchGlobalKillSwitch,
      enrollmentKilledOwnerSubjectIds:
        flowRuntimeRolloutPolicyVersions.enrollmentKilledOwnerSubjectIds,
      claimKilledOwnerSubjectIds: flowRuntimeRolloutPolicyVersions.claimKilledOwnerSubjectIds,
      externalDispatchKilledOwnerSubjectIds:
        flowRuntimeRolloutPolicyVersions.externalDispatchKilledOwnerSubjectIds,
      enrollmentKilledCapabilityKeys:
        flowRuntimeRolloutPolicyVersions.enrollmentKilledCapabilityKeys,
      claimKilledCapabilityKeys: flowRuntimeRolloutPolicyVersions.claimKilledCapabilityKeys,
      externalDispatchKilledCapabilityKeys:
        flowRuntimeRolloutPolicyVersions.externalDispatchKilledCapabilityKeys,
      readinessLeaseTtlMs: flowRuntimeRolloutPolicyVersions.readinessLeaseTtlMs,
      tokenLeaseDurationMs: flowRuntimeRolloutPolicyVersions.tokenLeaseDurationMs,
      canonicalPreimage: flowRuntimeRolloutPolicyVersions.canonicalPreimage,
      policyDigest: flowRuntimeRolloutPolicyVersions.policyDigest
    })
    .from(flowRuntimeControlAuthority)
    .innerJoin(
      flowRuntimeRolloutPolicyVersions,
      eq(
        flowRuntimeRolloutPolicyVersions.revision,
        flowRuntimeControlAuthority.currentPolicyRevision
      )
    )
    .where(eq(flowRuntimeControlAuthority.authorityKey, "primary"))
    .limit(1);
  const [row] =
    options.lockRows === false
      ? await query
      : await query.for("share", { of: flowRuntimeControlAuthority });
  if (
    !row ||
    row.authorityKey !== "primary" ||
    row.currentPolicyRevision !== row.revision ||
    row.controlRevision !== row.revision
  ) {
    throw new FlowRuntimeControlIntegrityError();
  }

  return verifyFlowRuntimeRolloutPolicyEvidence({
    policy: {
      schemaVersion: row.schemaVersion as FlowRuntimeRolloutPolicy["schemaVersion"],
      revision: row.revision,
      mode: row.mode as FlowRuntimeRolloutPolicy["mode"],
      canaryOwnerSubjectIds: row.canaryOwnerSubjectIds,
      allowedRequirementKeys: row.allowedRequirementKeys,
      killSwitches: {
        enrollment: {
          global: row.enrollmentGlobalKillSwitch,
          ownerSubjectIds: row.enrollmentKilledOwnerSubjectIds,
          capabilityKeys: row.enrollmentKilledCapabilityKeys
        },
        claim: {
          global: row.claimGlobalKillSwitch,
          ownerSubjectIds: row.claimKilledOwnerSubjectIds,
          capabilityKeys: row.claimKilledCapabilityKeys
        },
        externalDispatch: {
          global: row.externalDispatchGlobalKillSwitch,
          ownerSubjectIds: row.externalDispatchKilledOwnerSubjectIds,
          capabilityKeys: row.externalDispatchKilledCapabilityKeys
        }
      },
      readinessLeaseTtlMs: row.readinessLeaseTtlMs,
      tokenLeaseDurationMs: row.tokenLeaseDurationMs
    },
    canonicalPreimage: row.canonicalPreimage,
    policyDigest: row.policyDigest as `sha256:${string}`
  });
}
