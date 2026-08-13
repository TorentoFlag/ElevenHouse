export function createSessionRuntime(input: {
  readonly projectionIntervalMs: number;
  readonly maintenanceIntervalMs: number;
  readonly project: () => Promise<unknown>;
  readonly maintain: () => Promise<unknown>;
  readonly onError: (operation: "projection" | "maintenance", error: unknown) => void;
}) {
  assertInterval(input.projectionIntervalMs);
  assertInterval(input.maintenanceIntervalMs);
  let accepting = true;
  let projectionTimer: ReturnType<typeof setTimeout> | undefined;
  let maintenanceTimer: ReturnType<typeof setTimeout> | undefined;
  let projectionInFlight: Promise<void> | null = null;
  let maintenanceInFlight: Promise<void> | null = null;
  let projectionReady = false;
  let maintenanceReady = false;
  let projectionError: string | null = null;
  let maintenanceError: string | null = null;

  const runProjection = (): Promise<void> => {
    if (!accepting) return Promise.resolve();
    if (projectionInFlight) return projectionInFlight;
    const operation = Promise.resolve().then(input.project).then(() => {
      projectionReady = true;
      projectionError = null;
    }).catch((error: unknown) => {
      projectionError = "session_projection_failed";
      input.onError("projection", error);
      throw error;
    }).finally(() => {
      if (projectionInFlight === operation) projectionInFlight = null;
    });
    projectionInFlight = operation;
    return operation;
  };

  const runMaintenance = (): Promise<void> => {
    if (!accepting) return Promise.resolve();
    if (maintenanceInFlight) return maintenanceInFlight;
    const operation = Promise.resolve().then(input.maintain).then(() => {
      maintenanceReady = true;
      maintenanceError = null;
    }).catch((error: unknown) => {
      maintenanceError = "session_maintenance_failed";
      input.onError("maintenance", error);
      throw error;
    }).finally(() => {
      if (maintenanceInFlight === operation) maintenanceInFlight = null;
    });
    maintenanceInFlight = operation;
    return operation;
  };

  const scheduleProjection = (): void => {
    if (!accepting || projectionTimer) return;
    projectionTimer = setTimeout(() => {
      projectionTimer = undefined;
      void runProjection().catch(() => undefined).finally(scheduleProjection);
    }, input.projectionIntervalMs);
    projectionTimer.unref();
  };
  const scheduleMaintenance = (): void => {
    if (!accepting || maintenanceTimer) return;
    maintenanceTimer = setTimeout(() => {
      maintenanceTimer = undefined;
      void runMaintenance().catch(() => undefined).finally(scheduleMaintenance);
    }, input.maintenanceIntervalMs);
    maintenanceTimer.unref();
  };

  return {
    runOnce: async () => {
      await Promise.all([runProjection(), runMaintenance()]);
    },
    start: () => {
      scheduleProjection();
      scheduleMaintenance();
    },
    stop: async () => {
      accepting = false;
      if (projectionTimer) clearTimeout(projectionTimer);
      if (maintenanceTimer) clearTimeout(maintenanceTimer);
      projectionTimer = undefined;
      maintenanceTimer = undefined;
      await Promise.all([
        projectionInFlight?.catch(() => undefined),
        maintenanceInFlight?.catch(() => undefined)
      ]);
    },
    getOperationalReadiness: () => {
      const errorCode = projectionError ?? maintenanceError;
      if (errorCode) return { status: "not_ready" as const, errorCode };
      if (!projectionReady || !maintenanceReady) {
        return { status: "not_ready" as const, errorCode: "session_runtime_not_initialized" };
      }
      return { status: "ready" as const };
    }
  };
}

function assertInterval(value: number): void {
  if (!Number.isInteger(value) || value < 100) {
    throw new Error("SESSION_RUNTIME_INTERVAL_INVALID");
  }
}
