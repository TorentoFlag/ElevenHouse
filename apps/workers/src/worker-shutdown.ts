type ShutdownOperation = () => unknown | PromiseLike<unknown>;

export async function shutdownWorkerRuntime(input: {
  readonly beginDrain: ShutdownOperation;
  readonly stopConcurrent: readonly ShutdownOperation[];
  readonly closeHealthServer: ShutdownOperation;
  readonly stopWorkerObservation: ShutdownOperation;
  readonly closeCalculationWorker: ShutdownOperation;
  readonly closeQueue: ShutdownOperation;
  readonly closePostgres: ShutdownOperation;
}): Promise<void> {
  const errors: unknown[] = [];

  await settle(input.beginDrain, errors);
  await Promise.all(input.stopConcurrent.map((operation) => settle(operation, errors)));
  await settle(input.closeHealthServer, errors);
  await settle(input.stopWorkerObservation, errors);
  await settle(input.closeCalculationWorker, errors);
  await settle(input.closeQueue, errors);
  await settle(input.closePostgres, errors);

  if (errors.length > 0) throw new AggregateError(errors, "Worker shutdown failed");
}

async function settle(operation: ShutdownOperation, errors: unknown[]): Promise<void> {
  try {
    await operation();
  } catch (error) {
    errors.push(error);
  }
}
