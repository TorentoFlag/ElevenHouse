import type { CanonicalClientOrderCaptureProcessor } from "./canonical-client-order-capture.processor";

export function startCanonicalClientOrderCaptureInterval(input: Readonly<{
  processor: CanonicalClientOrderCaptureProcessor;
  intervalMs: number;
  onResult?: (result: Awaited<ReturnType<CanonicalClientOrderCaptureProcessor["processOne"]>>) => void;
  onError: (error: unknown) => void;
}>): () => void {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs <= 0) return () => undefined;

  const run = async (): Promise<void> => {
    try {
      input.onResult?.(await input.processor.processOne());
    } catch (error) {
      input.onError(error);
    }
  };
  const timer = setInterval(() => {
    void run();
  }, input.intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
