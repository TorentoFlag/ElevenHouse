import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { saveCalculationInterpretation } from "./calculationsApi";

const calculationId = "44444444-4444-4444-8444-444444444444";
const idempotencyKey = "66666666-6666-4666-8666-666666666666";
const checksum = `sha256:${"a".repeat(64)}`;

describe("calculationsApi", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends a manual interpretation resource UUID with CSRF protection", async () => {
    const response = calculationRecordResponse();
    const post = vi.spyOn(application.http, "post").mockResolvedValue(response);

    await expect(
      saveCalculationInterpretation({
        calculationId,
        idempotencyKey,
        body: { text: "Проверено", expectedResultChecksum: checksum }
      })
    ).resolves.toEqual(response);

    expect(post).toHaveBeenCalledWith(
      `/calculations/${calculationId}/interpretations`,
      { text: "Проверено", expectedResultChecksum: checksum },
      { csrf: true, headers: { "idempotency-key": idempotencyKey } }
    );
  });
});

function calculationRecordResponse() {
  return {
    id: calculationId,
    ownerUserId: "11111111-1111-4111-8111-111111111111",
    module: "numerology",
    mode: "individual",
    interpretationMode: null,
    methodCode: "pythagorean",
    title: "Calculation",
    status: "calculated",
    requestFingerprint: `sha256:${"b".repeat(64)}`,
    inputData: {},
    resultData: {},
    resultSummary: {},
    resultChecksum: checksum,
    participants: [
      {
        role: "subject",
        source: "manual",
        clientId: null,
        displayName: "Мария"
      }
    ],
    links: [],
    interpretations: [{ id: idempotencyKey, status: "draft", text: "Проверено" }],
    artifacts: [],
    createdAt: "2026-08-03T10:00:00.000Z",
    updatedAt: "2026-08-03T10:00:00.000Z"
  };
}
