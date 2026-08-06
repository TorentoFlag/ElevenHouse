import {
  assertChartBirthDataReady,
  FlowExecutionIntegrityError,
  parseBookingClientDataRequirementsSnapshot,
  type FlowBirthDataReadinessReader
} from "@elevenhouse/domain";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { bookings, clientAstrologerRelationships, clientBirthData } from "../../schema";

export function createDrizzleFlowBirthDataReadinessReader(
  database: ElevenHouseDatabase
): FlowBirthDataReadinessReader {
  return {
    read: async ({ ownerUserId, bookingId, clientUserId }) => {
      const [row] = await database
        .select({
          state: bookings.state,
          requirements: bookings.clientDataRequirementsSnapshot,
          birthDataId: clientBirthData.id,
          birthDate: clientBirthData.birthDate,
          birthTime: clientBirthData.birthTime,
          birthTimePrecision: clientBirthData.birthTimePrecision,
          birthTimezone: clientBirthData.birthTimezone,
          birthLatitude: clientBirthData.birthLatitude,
          birthLongitude: clientBirthData.birthLongitude,
          birthTimeDstOccurrence: clientBirthData.birthTimeDstOccurrence
        })
        .from(bookings)
        .innerJoin(
          clientAstrologerRelationships,
          and(
            eq(clientAstrologerRelationships.clientUserId, bookings.clientUserId),
            eq(clientAstrologerRelationships.astrologerUserId, bookings.ownerUserId),
            eq(clientAstrologerRelationships.status, "active")
          )
        )
        .leftJoin(clientBirthData, eq(clientBirthData.clientUserId, bookings.clientUserId))
        .where(
          and(
            eq(bookings.id, bookingId),
            eq(bookings.ownerUserId, ownerUserId),
            eq(bookings.clientUserId, clientUserId)
          )
        )
        .limit(1);

      if (!row || row.state !== "confirmed") {
        throw new FlowExecutionIntegrityError(
          "FLOW_TOKEN_RUNTIME_STATE_INVALID",
          "Birth-data readiness requires the pinned confirmed booking, owner, client, and relationship"
        );
      }

      const requirements = parseBookingClientDataRequirementsSnapshot(row.requirements);
      if (requirements.schemaVersion !== "booking-client-data-requirements.v1") {
        throw new FlowExecutionIntegrityError(
          "FLOW_TOKEN_RUNTIME_STATE_INVALID",
          "Birth-data readiness requires a pinned booking requirements snapshot"
        );
      }
      if (requirements.requiredClientData.includes("chart2")) {
        throw new FlowExecutionIntegrityError(
          "FLOW_TOKEN_RUNTIME_STATE_INVALID",
          "Birth-data readiness cannot satisfy a two-person chart from a single booking client"
        );
      }
      const requiresChart = requirements.requiredClientData.some(
        (requiredData) => requiredData === "chart1"
      );
      if (!requiresChart) return { ready: true };
      if (!row.birthDataId) return { ready: false };

      try {
        assertChartBirthDataReady({
          birthDate: row.birthDate,
          birthTime: row.birthTime,
          birthTimePrecision: row.birthTimePrecision as "exact" | "approximate" | "unknown",
          birthTimezone: row.birthTimezone,
          birthLatitude: row.birthLatitude,
          birthLongitude: row.birthLongitude,
          birthTimeDstOccurrence: row.birthTimeDstOccurrence as "first" | "second" | null
        });
        return { ready: true };
      } catch {
        return { ready: false };
      }
    }
  };
}
