import type {
  AstroCalendarClientBirthDataInput,
  AstroCalendarClientReadiness,
  AstroCalendarGenerationPlan,
  AstroCalendarGenerationPlanInput,
  AstroCalendarReadinessSummary,
  AstroCalendarWarning,
  AstroCalendarWarningCode
} from "./astro-calendar-types";

export function planAstroCalendarGeneration(
  input: AstroCalendarGenerationPlanInput
): AstroCalendarGenerationPlan {
  const clientReadiness = input.clients.map(buildClientReadiness);
  const warnings = clientReadiness.flatMap((readiness) =>
    readiness.warnings.map((code) => buildClientWarning(readiness, code))
  );

  return {
    readiness: summarizeReadiness(clientReadiness),
    clientReadiness,
    warnings
  };
}

function buildClientReadiness(
  client: AstroCalendarClientBirthDataInput
): AstroCalendarClientReadiness {
  const warnings: AstroCalendarWarningCode[] = [];
  const hasDate = client.birthDate !== null;
  const hasPlace =
    client.birthTimezone !== null &&
    client.birthLatitude !== null &&
    client.birthLongitude !== null;

  if (!hasDate || !hasPlace) {
    warnings.push("CLIENT_BIRTH_DATA_MISSING");
    return {
      clientId: client.clientId,
      displayName: client.displayName,
      canUseDateOnlyEvents: false,
      canUseTimedEvents: false,
      warnings
    };
  }

  if (client.birthTime === null || client.birthTimePrecision === "unknown") {
    warnings.push("CLIENT_BIRTH_TIME_UNKNOWN");
    return {
      clientId: client.clientId,
      displayName: client.displayName,
      canUseDateOnlyEvents: true,
      canUseTimedEvents: false,
      warnings
    };
  }

  if (client.birthTimePrecision === "approximate") {
    warnings.push("CLIENT_BIRTH_TIME_APPROXIMATE");
  }

  return {
    clientId: client.clientId,
    displayName: client.displayName,
    canUseDateOnlyEvents: true,
    canUseTimedEvents: true,
    warnings
  };
}

function summarizeReadiness(
  clientReadiness: readonly AstroCalendarClientReadiness[]
): AstroCalendarReadinessSummary {
  return {
    clientsTotal: clientReadiness.length,
    clientsReady: clientReadiness.filter((client) => client.canUseTimedEvents).length,
    clientsWithMissingBirthData: countClientsWithWarning(
      clientReadiness,
      "CLIENT_BIRTH_DATA_MISSING"
    ),
    clientsWithUnknownBirthTime: countClientsWithWarning(
      clientReadiness,
      "CLIENT_BIRTH_TIME_UNKNOWN"
    ),
    clientsWithApproximateBirthTime: countClientsWithWarning(
      clientReadiness,
      "CLIENT_BIRTH_TIME_APPROXIMATE"
    )
  };
}

function countClientsWithWarning(
  clientReadiness: readonly AstroCalendarClientReadiness[],
  code: AstroCalendarWarningCode
): number {
  return clientReadiness.filter((client) => client.warnings.includes(code)).length;
}

function buildClientWarning(
  client: AstroCalendarClientReadiness,
  code: AstroCalendarWarningCode
): AstroCalendarWarning {
  return {
    code,
    severity: code === "CLIENT_BIRTH_DATA_MISSING" ? "error" : "warning",
    message: warningMessage(client.displayName, code),
    clientId: client.clientId,
    eventId: null,
    dictionaryCode: null,
    action: null
  };
}

function warningMessage(displayName: string, code: AstroCalendarWarningCode): string {
  if (code === "CLIENT_BIRTH_DATA_MISSING") {
    return `${displayName}: не хватает даты или места рождения для персональных событий.`;
  }
  if (code === "CLIENT_BIRTH_TIME_UNKNOWN") {
    return `${displayName}: время рождения не указано, точные транзиты будут недоступны.`;
  }
  if (code === "CLIENT_BIRTH_TIME_APPROXIMATE") {
    return `${displayName}: время рождения приблизительное, точность событий ограничена.`;
  }
  return `${displayName}: предупреждение astro calendar ${code}.`;
}
