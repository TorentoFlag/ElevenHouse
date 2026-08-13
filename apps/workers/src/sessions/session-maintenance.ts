import { runSessionMaintenance, type SessionMaintenanceStore } from "@elevenhouse/domain";

export function maintainSessions(input: {
  readonly store: SessionMaintenanceStore;
  readonly now: Date;
  readonly batchSize: number;
}) {
  return runSessionMaintenance(input);
}
