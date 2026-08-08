import {
  chartMethodVersions,
  chartSettingsSchema,
  type ChartExecutionProfile
} from "@elevenhouse/contracts";
import {
  assertChartBirthDataReady,
  buildChartJobRequestFingerprint,
  createNatalChartJobAndRequestCalculation,
  DEFAULT_CHART_JOB_MAX_ATTEMPTS,
  FlowExecutionIntegrityError,
  parseBookingClientDataRequirementsSnapshot,
  type ChartCalculationCommandStore,
  type FlowNatalChartRequester
} from "@elevenhouse/domain";
import { and, desc, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { bookings, chartCalculationJobs, clientBirthData } from "../../schema";

export function createDrizzleFlowNatalChartRequester(
  database: ElevenHouseDatabase,
  input: {
    readonly commandStore: ChartCalculationCommandStore;
    readonly executionProfile: ChartExecutionProfile;
    readonly now?: () => Date;
  }
): FlowNatalChartRequester {
  const now = input.now ?? (() => new Date());

  return {
    request: async (request) => {
      const [row] = await database
        .select({
          bookingId: bookings.id,
          ownerUserId: bookings.ownerUserId,
          clientUserId: bookings.clientUserId,
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
        .leftJoin(clientBirthData, eq(clientBirthData.clientUserId, bookings.clientUserId))
        .where(
          and(
            eq(bookings.id, request.bookingId),
            eq(bookings.ownerUserId, request.ownerUserId),
            eq(bookings.clientUserId, request.clientUserId)
          )
        )
        .limit(1);

      if (!row || row.state !== "confirmed") {
        throw new FlowExecutionIntegrityError(
          "FLOW_TOKEN_RUNTIME_STATE_INVALID",
          "Natal-chart request requires the pinned confirmed booking, owner, and client"
        );
      }
      const requirements = parseBookingClientDataRequirementsSnapshot(row.requirements);
      if (
        !requirements.methods.includes("natal") ||
        !requirements.requiredClientData.includes("chart1") ||
        requirements.requiredClientData.includes("chart2")
      ) {
        throw new FlowExecutionIntegrityError(
          "FLOW_TOKEN_RUNTIME_STATE_INVALID",
          "Natal-chart request is not eligible for this booking requirements snapshot"
        );
      }
      if (!row.birthDataId) {
        throw new FlowExecutionIntegrityError(
          "FLOW_TOKEN_RUNTIME_STATE_INVALID",
          "Natal-chart request requires the client singleton birth profile"
        );
      }

      const birthData = assertChartBirthDataReady({
        birthDate: row.birthDate,
        birthTime: row.birthTime,
        birthTimePrecision: row.birthTimePrecision as "exact" | "approximate" | "unknown",
        birthTimezone: row.birthTimezone,
        birthLatitude: row.birthLatitude,
        birthLongitude: row.birthLongitude,
        birthTimeDstOccurrence: row.birthTimeDstOccurrence as "first" | "second" | null
      });
      const settings = chartSettingsSchema.parse(request.settings);
      const inputSnapshot = {
        birthDate: birthData.birthDate,
        birthTime: birthData.birthTime,
        timezone: birthData.birthTimezone,
        latitude: birthData.birthLatitude,
        longitude: birthData.birthLongitude,
        birthTimePrecision: birthData.birthTimePrecision,
        ...(birthData.birthTimeDstOccurrence
          ? { dstOccurrence: birthData.birthTimeDstOccurrence }
          : {})
      };
      const participants = [{ role: "subject" as const, clientId: request.clientUserId }];
      const methodVersion = chartMethodVersions.natal;
      const inputFingerprint = buildChartJobRequestFingerprint({
        ownerUserId: request.ownerUserId,
        method: "natal",
        methodVersion,
        executionProfile: input.executionProfile,
        interpretationMode: request.interpretationMode,
        settings,
        inputSnapshot,
        participants
      });

      const outcome = await createNatalChartJobAndRequestCalculation({
        store: input.commandStore,
        now: now(),
        ownerUserId: request.ownerUserId,
        clientId: request.clientUserId,
        methodVersion,
        executionProfile: input.executionProfile,
        interpretationMode: request.interpretationMode,
        inputSnapshot,
        settingsSnapshot: settings,
        participants,
        maxAttempts: DEFAULT_CHART_JOB_MAX_ATTEMPTS,
        targetCalculationId: null,
        expectedSourceChecksum: null,
        inputFingerprint
      });
      if (outcome.kind === "active_job") return outcome;

      const [sourceJob] = await database
        .select({ id: chartCalculationJobs.id })
        .from(chartCalculationJobs)
        .where(
          and(
            eq(chartCalculationJobs.ownerUserId, request.ownerUserId),
            eq(chartCalculationJobs.method, "natal"),
            eq(chartCalculationJobs.status, "succeeded"),
            eq(chartCalculationJobs.resultCalculationId, outcome.calculationId)
          )
        )
        .orderBy(desc(chartCalculationJobs.finishedAt), desc(chartCalculationJobs.id))
        .limit(1);
      if (!sourceJob) {
        throw new FlowExecutionIntegrityError(
          "FLOW_TOKEN_RUNTIME_STATE_INVALID",
          "Reused natal chart result is missing its succeeded source job"
        );
      }
      return { kind: "existing_result", calculationId: outcome.calculationId, jobId: sourceJob.id };
    }
  };
}
