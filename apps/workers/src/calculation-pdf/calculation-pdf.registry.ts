import type { CalculationModule, CalculationPdfJob } from "@elevenhouse/domain";

export type RenderedCalculationPdf = {
  readonly bytes: Buffer;
  readonly pageCount: number;
};

export type CalculationPdfRendererRegistration = {
  readonly module: CalculationModule;
  readonly methodCode: string;
  readonly render: (job: CalculationPdfJob) => Promise<RenderedCalculationPdf>;
};

export type CalculationPdfRegistry = {
  readonly render: (job: CalculationPdfJob) => Promise<RenderedCalculationPdf>;
};

export class CalculationPdfPermanentError extends Error {
  override readonly name = "CalculationPdfPermanentError";

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function createCalculationPdfRegistry(
  registrations: readonly CalculationPdfRendererRegistration[]
): CalculationPdfRegistry {
  const renderers = new Map<string, CalculationPdfRendererRegistration["render"]>();
  for (const registration of registrations) {
    const key = registryKey(registration.module, registration.methodCode);
    if (renderers.has(key)) throw new Error(`Duplicate calculation PDF renderer: ${key}`);
    renderers.set(key, registration.render);
  }
  return {
    render: async (job) => {
      const renderer = renderers.get(registryKey(job.module, job.methodCode));
      if (!renderer) {
        throw new CalculationPdfPermanentError(
          "unsupported_method",
          "Calculation PDF method is not supported"
        );
      }
      return renderer(job);
    }
  };
}

function registryKey(module: CalculationModule, methodCode: string): string {
  return `${module}:${methodCode}`;
}
