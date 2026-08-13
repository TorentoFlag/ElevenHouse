import {
  processPendingSessionBookingLifecycleEvents,
  type SessionProvisioningStore
} from "@elevenhouse/domain";

export function processSessionBookingLifecycleEvents(input: {
  readonly store: SessionProvisioningStore;
  readonly now: Date;
  readonly batchSize: number;
}) {
  return processPendingSessionBookingLifecycleEvents(input);
}
