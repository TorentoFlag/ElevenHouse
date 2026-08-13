import type { ProductDeliveryFormat } from "../products";

export type SessionBookingLifecycleProjectionAction =
  | "provision"
  | "reschedule"
  | "cancel"
  | "ignore";

export type SessionProvisioningBatchResult = {
  readonly processed: number;
  readonly provisioned: number;
  readonly updated: number;
  readonly ignored: number;
};

export type SessionProvisioningStore = {
  processPending(input: {
    readonly now: string;
    readonly limit: number;
  }): Promise<SessionProvisioningBatchResult>;
};

export type SessionMaintenanceStore = {
  expireScheduled(input: {
    readonly now: string;
    readonly limit: number;
  }): Promise<readonly string[]>;
  endAbsentActive(input: {
    readonly now: string;
    readonly absentBefore: string;
    readonly limit: number;
  }): Promise<readonly string[]>;
};

export function decideSessionBookingLifecycleProjection(input: {
  readonly eventKind: "confirmed" | "rescheduled" | "completed" | "cancelled";
  readonly deliveryFormat: ProductDeliveryFormat;
}): SessionBookingLifecycleProjectionAction {
  if (input.deliveryFormat !== "video") return "ignore";
  if (input.eventKind === "confirmed") return "provision";
  if (input.eventKind === "rescheduled") return "reschedule";
  if (input.eventKind === "cancelled") return "cancel";
  return "ignore";
}

export function processPendingSessionBookingLifecycleEvents(input: {
  readonly store: SessionProvisioningStore;
  readonly now: Date;
  readonly batchSize: number;
}): Promise<SessionProvisioningBatchResult> {
  return input.store.processPending({ now: input.now.toISOString(), limit: input.batchSize });
}

export async function runSessionMaintenance(input: {
  readonly store: SessionMaintenanceStore;
  readonly now: Date;
  readonly batchSize: number;
}) {
  const now = input.now.toISOString();
  const absentBefore = new Date(input.now.getTime() - 15 * 60 * 1_000).toISOString();
  const expired = await input.store.expireScheduled({ now, limit: input.batchSize });
  const ended = await input.store.endAbsentActive({
    now,
    absentBefore,
    limit: input.batchSize
  });
  return { expired, ended };
}
