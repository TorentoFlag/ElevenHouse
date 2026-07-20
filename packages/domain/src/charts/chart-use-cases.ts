import { normalizeRequiredString } from "../shared";
import type {
  ChartCalculationCommandStore,
  ChartCalculationJobStore,
  CreateOrReuseNatalJobResult
} from "./chart-types";

export function createNatalChartJob(input: {
  readonly store: ChartCalculationJobStore;
  readonly ownerUserId: string;
  readonly clientId: string;
  readonly inputFingerprint: string;
  readonly inputSnapshot: unknown;
  readonly settingsSnapshot: unknown;
}): Promise<CreateOrReuseNatalJobResult> {
  return input.store.createOrReuseNatalJob({
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Chart owner user id is required"),
    clientId: normalizeRequiredString(input.clientId, "Chart client id is required"),
    inputFingerprint: normalizeRequiredString(
      input.inputFingerprint,
      "Chart input fingerprint is required"
    ),
    inputSnapshot: input.inputSnapshot,
    settingsSnapshot: input.settingsSnapshot
  });
}

export function createNatalChartJobAndRequestCalculation(input: {
  readonly store: ChartCalculationCommandStore;
  readonly ownerUserId: string;
  readonly clientId: string;
  readonly inputFingerprint: string;
  readonly inputSnapshot: unknown;
  readonly settingsSnapshot: unknown;
  readonly now: Date;
}): Promise<CreateOrReuseNatalJobResult> {
  return input.store.createOrReuseNatalJobAndRequestCalculation({
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Chart owner user id is required"),
    clientId: normalizeRequiredString(input.clientId, "Chart client id is required"),
    inputFingerprint: normalizeRequiredString(
      input.inputFingerprint,
      "Chart input fingerprint is required"
    ),
    inputSnapshot: input.inputSnapshot,
    settingsSnapshot: input.settingsSnapshot,
    now: input.now.toISOString()
  });
}
