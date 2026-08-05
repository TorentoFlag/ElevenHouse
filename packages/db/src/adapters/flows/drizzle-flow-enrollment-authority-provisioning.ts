import { FlowEnrollmentAuthorityIntegrityError } from "@elevenhouse/domain";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { flowAutomationQuotaAuthorities, flowRuntimeOwnerSubjects } from "../../schema/flows";

type ProvisioningTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];

export async function provisionFlowEnrollmentReadAuthority(
  transaction: ProvisioningTransaction,
  ownerUserId: string
): Promise<void> {
  await transaction.insert(flowRuntimeOwnerSubjects).values({ ownerUserId }).onConflictDoNothing();
  const subjects = await transaction
    .select({ ownerSubjectId: flowRuntimeOwnerSubjects.ownerSubjectId })
    .from(flowRuntimeOwnerSubjects)
    .where(
      and(
        eq(flowRuntimeOwnerSubjects.ownerUserId, ownerUserId),
        eq(flowRuntimeOwnerSubjects.state, "active")
      )
    )
    .limit(2);
  if (subjects.length !== 1) throw new FlowEnrollmentAuthorityIntegrityError();

  await transaction
    .insert(flowAutomationQuotaAuthorities)
    .values({ ownerSubjectId: subjects[0]!.ownerSubjectId })
    .onConflictDoNothing({ target: flowAutomationQuotaAuthorities.ownerSubjectId });
  const [quota] = await transaction
    .select({ ownerSubjectId: flowAutomationQuotaAuthorities.ownerSubjectId })
    .from(flowAutomationQuotaAuthorities)
    .where(eq(flowAutomationQuotaAuthorities.ownerSubjectId, subjects[0]!.ownerSubjectId))
    .limit(1);
  if (!quota) throw new FlowEnrollmentAuthorityIntegrityError();
}
