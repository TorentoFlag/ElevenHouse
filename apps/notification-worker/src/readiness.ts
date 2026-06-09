export type WorkerReadiness = {
  readonly service: string;
  readonly status: "ready";
  readonly timestamp: string;
};

export function createWorkerReadiness(service: string, now: Date = new Date()): WorkerReadiness {
  return {
    service,
    status: "ready",
    timestamp: now.toISOString()
  };
}
