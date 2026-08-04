import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { idempotencyRequiredMetadataKey } from "../security/route-policy/route-security-metadata";
import { CalculationsController } from "./calculations.controller";
import type { CalculationsService } from "./calculations.service";

const calculationId = "44444444-4444-4444-8444-444444444444";
const idempotencyKey = "66666666-6666-4666-8666-666666666666";

describe("CalculationsController manual interpretation command", () => {
  it("requires the dedicated idempotency scope", () => {
    expect(
      Reflect.getMetadata(
        idempotencyRequiredMetadataKey,
        CalculationsController.prototype.saveManualInterpretation
      )
    ).toEqual({ scope: "calculations.interpretations.manual.save.v1" });
  });

  it("forwards the single validated header value to the service", async () => {
    const saveManualInterpretation = vi.fn().mockResolvedValue({ id: calculationId });
    const controller = new CalculationsController({
      saveManualInterpretation
    } as unknown as CalculationsService);
    const body = { text: "Проверено", expectedResultChecksum: `sha256:${"a".repeat(64)}` };
    const request = {} as AstrologerSessionRequest;

    await controller.saveManualInterpretation(calculationId, body, request, idempotencyKey);

    expect(saveManualInterpretation).toHaveBeenCalledWith(
      calculationId,
      body,
      request,
      idempotencyKey
    );
  });
});
