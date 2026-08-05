import {
  FlowRuntimeControlIntegrityError,
  type FlowRuntimeOwnerSubjectStore
} from "@elevenhouse/domain";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { flowRuntimeOwnerSubjects } from "../../schema/flows";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createDrizzleFlowRuntimeOwnerSubjectStore(
  database: ElevenHouseDatabase
): FlowRuntimeOwnerSubjectStore {
  return Object.freeze({
    resolveOrCreateActive: async ({ ownerUserIds }) => {
      const normalizedOwnerUserIds = normalizeOwnerUserIds(ownerUserIds);
      if (normalizedOwnerUserIds.length === 0) return [];
      try {
        return await database.transaction(async (transaction) => {
          await transaction
            .insert(flowRuntimeOwnerSubjects)
            .values(normalizedOwnerUserIds.map((ownerUserId) => ({ ownerUserId })))
            .onConflictDoNothing();
          const rows = await transaction
            .select({
              ownerUserId: flowRuntimeOwnerSubjects.ownerUserId,
              ownerSubjectId: flowRuntimeOwnerSubjects.ownerSubjectId
            })
            .from(flowRuntimeOwnerSubjects)
            .where(
              and(
                inArray(flowRuntimeOwnerSubjects.ownerUserId, normalizedOwnerUserIds),
                eq(flowRuntimeOwnerSubjects.state, "active"),
                isNotNull(flowRuntimeOwnerSubjects.ownerUserId)
              )
            );
          const subjectByOwner = new Map(
            rows.map((row) => [row.ownerUserId, row.ownerSubjectId] as const)
          );
          const resolved = normalizedOwnerUserIds.map((ownerUserId) => ({
            ownerUserId,
            ownerSubjectId: subjectByOwner.get(ownerUserId)
          }));
          if (resolved.some((mapping) => !mapping.ownerSubjectId)) {
            throw new FlowRuntimeControlIntegrityError();
          }
          return resolved as readonly {
            readonly ownerUserId: string;
            readonly ownerSubjectId: string;
          }[];
        });
      } catch (error) {
        if (error instanceof FlowRuntimeControlIntegrityError) throw error;
        throw new FlowRuntimeControlIntegrityError();
      }
    }
  });
}

function normalizeOwnerUserIds(ownerUserIds: readonly string[]): readonly string[] {
  if (
    !Array.isArray(ownerUserIds) ||
    ownerUserIds.length > 100 ||
    ownerUserIds.some((ownerUserId) => !UUID_PATTERN.test(ownerUserId))
  ) {
    throw new FlowRuntimeControlIntegrityError();
  }
  const normalized = ownerUserIds.map((ownerUserId) => ownerUserId.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new FlowRuntimeControlIntegrityError();
  }
  return normalized.sort(compareStableText);
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
