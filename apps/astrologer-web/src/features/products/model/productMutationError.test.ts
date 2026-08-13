import { describe, expect, it } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import { describeProductMutationError, isProductRevisionConflict } from "./productMutationError";

describe("describeProductMutationError", () => {
  it.each([
    [
      "ru" as const,
      "Продукт изменился в другой вкладке: текущая редакция 8. Обновите страницу перед повторной правкой."
    ],
    [
      "en" as const,
      "The product changed in another tab. Current revision: 8. Reload the page before editing again."
    ]
  ])("describes a typed revision conflict in %s", (locale, expectedMessage) => {
    const error = new HttpError(409, {
      code: "PRODUCT_REVISION_CONFLICT",
      expectedRevision: 7,
      currentRevision: 8
    });

    expect(describeProductMutationError(error, locale, "generic error")).toBe(expectedMessage);
  });

  it.each([
    [
      "ru" as const,
      "Подписку на Астродневник пока нельзя активировать: платежи и выдача доступа еще не подключены. Сохраните продукт как черновик."
    ],
    [
      "en" as const,
      "The AstroDiary subscription cannot be activated yet because billing and access fulfillment are not connected. Save the product as a draft."
    ]
  ])("describes the typed fulfillment blocker in %s", (locale, expectedMessage) => {
    const error = new HttpError(409, {
      code: "PRODUCT_FULFILLMENT_NOT_READY",
      message: "AstroDiary subscription fulfillment is not ready"
    });

    expect(describeProductMutationError(error, locale, "generic error")).toBe(expectedMessage);
  });

  it("keeps the localized generic message for an unknown error shape", () => {
    expect(
      describeProductMutationError(new HttpError(409, { code: "UNKNOWN" }), "ru", "fallback")
    ).toBe("fallback");
  });

  it("classifies only a contract-valid product revision conflict as reload-required", () => {
    expect(
      isProductRevisionConflict(
        new HttpError(409, {
          code: "PRODUCT_REVISION_CONFLICT",
          expectedRevision: 7,
          currentRevision: 8
        })
      )
    ).toBe(true);
    expect(
      isProductRevisionConflict(
        new HttpError(409, {
          code: "PRODUCT_FULFILLMENT_NOT_READY",
          message: "not ready"
        })
      )
    ).toBe(false);
  });
});
