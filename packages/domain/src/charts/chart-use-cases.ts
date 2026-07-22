import { normalizeRequiredString } from "../shared";
import type {
  ChartCalculationMethod,
  ChartCalculationCommandStore,
  ChartCalculationJobStore,
  CreateOrReuseChartJobResult,
  CreateOrReuseNatalJobResult
} from "./chart-types";

export function createChartJob(input: {
  readonly store: ChartCalculationJobStore;
  readonly method: ChartCalculationMethod;
  readonly ownerUserId: string;
  readonly clientId: string;
  readonly inputFingerprint: string;
  readonly inputSnapshot: unknown;
  readonly settingsSnapshot: unknown;
}): Promise<CreateOrReuseChartJobResult> {
  return input.store.createOrReuseChartJob({
    method: input.method,
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

export function createChartJobAndRequestCalculation(input: {
  readonly store: ChartCalculationCommandStore;
  readonly method: ChartCalculationMethod;
  readonly ownerUserId: string;
  readonly clientId: string;
  readonly inputFingerprint: string;
  readonly inputSnapshot: unknown;
  readonly settingsSnapshot: unknown;
  readonly now: Date;
}): Promise<CreateOrReuseChartJobResult> {
  return input.store.createOrReuseChartJobAndRequestCalculation({
    method: input.method,
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
