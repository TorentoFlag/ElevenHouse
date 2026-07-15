import type { CalculationPdfJob } from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import {
  CalculationPdfPermanentError,
  createCalculationPdfRegistry
} from "./calculation-pdf.registry";

describe("calculation PDF registry", () => {
  it("dispatches by module and method code", async () => {
    const render = vi.fn(async () => ({ bytes: Buffer.from("%PDF"), pageCount: 1 }));
    const registry = createCalculationPdfRegistry([
      { module: "numerology", methodCode: "pythagorean", render }
    ]);

    await expect(registry.render(job())).resolves.toMatchObject({ pageCount: 1 });
    expect(render).toHaveBeenCalledWith(job());
  });

  it("classifies an unsupported method as a permanent failure", async () => {
    const registry = createCalculationPdfRegistry([]);

    await expect(registry.render(job())).rejects.toMatchObject({
      name: "CalculationPdfPermanentError",
      code: "unsupported_method"
    } satisfies Partial<CalculationPdfPermanentError>);
  });

  it("rejects duplicate registrations", () => {
    const registration = {
      module: "numerology" as const,
      methodCode: "pythagorean",
      render: vi.fn()
    };
    expect(() => createCalculationPdfRegistry([registration, registration])).toThrow(
      "Duplicate calculation PDF renderer"
    );
  });
});

export function job(overrides: Partial<CalculationPdfJob> = {}): CalculationPdfJob {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    calculationId: "00000000-0000-4000-8000-000000000002",
    ownerUserId: "00000000-0000-4000-8000-000000000003",
    module: "numerology",
    methodCode: "pythagorean",
    resultChecksum: `sha256:${"a".repeat(64)}`,
    locale: "ru",
    sourceLocator: { kind: "approved_interpretation", interpretationId: null },
    documentFingerprint: `sha256:${"b".repeat(64)}`,
    status: "queued",
    artifactId: "00000000-0000-4000-8000-000000000004",
    mediaAssetId: "00000000-0000-4000-8000-000000000005",
    failureCode: null,
    failureReason: null,
    pageCount: null,
    createdAt: "2026-07-15T12:00:00.000Z",
    updatedAt: "2026-07-15T12:00:00.000Z",
    ...overrides
  };
}
