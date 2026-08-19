import { describe, expect, it } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import { describeProductMutationError } from "./productMutationError";

describe("describeProductMutationError", () => {
  it("describes AstroDiary fulfillment configuration errors without claiming payments are disconnected", () => {
    const error = new HttpError(409, {
      code: "PRODUCT_FULFILLMENT_NOT_READY",
      message: "AstroDiary fulfillment shape is not canonical"
    });

    expect(describeProductMutationError(error, "ru", "Не удалось сохранить")).toBe(
      "Проверьте настройки Астродневника: нужен канонический продукт с разовой оплатой и полной конфигурацией платного периода."
    );
    expect(describeProductMutationError(error, "en", "Could not save")).toBe(
      "Check the AstroDiary settings: it must be the canonical one-time paid-period product with complete paid-period configuration."
    );
  });

  it("keeps revision conflict guidance exact", () => {
    const error = new HttpError(409, {
      code: "PRODUCT_REVISION_CONFLICT",
      expectedRevision: 1,
      currentRevision: 3
    });

    expect(describeProductMutationError(error, "en", "Could not save")).toContain(
      "Current revision: 3"
    );
  });
});
