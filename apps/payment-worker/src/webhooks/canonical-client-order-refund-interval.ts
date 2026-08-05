import { createCanonicalClientOrderRefundProcessor } from "./canonical-client-order-refund.processor";

export function startCanonicalClientOrderRefundInterval(input: Readonly<{
  processor: ReturnType<typeof createCanonicalClientOrderRefundProcessor>;
  intervalMs: number;
  onResult: (result: Awaited<ReturnType<ReturnType<typeof createCanonicalClientOrderRefundProcessor>["processOne"]>>) => void;
  onError: (error: unknown) => void;
}>): () => void {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs <= 0) return () => undefined;
  const run = async () => {
    try {
      input.onResult(await input.processor.processOne());
    } catch (error) {
      input.onError(error);
    }
  };
  const timer = setInterval(() => void run(), input.intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
