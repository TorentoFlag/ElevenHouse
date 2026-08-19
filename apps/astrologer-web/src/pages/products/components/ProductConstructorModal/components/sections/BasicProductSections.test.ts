import { describe, expect, it } from "vitest";

import { createDefaultProductDraft } from "../../../../../../features/products/model/productDraft";
import { normalizeAstroDiaryProductDraft } from "../../../../../../features/products/model/astroDiaryProductDraft";
import { resolveProductPaymentSectionVisibility } from "./BasicProductSections";

describe("resolveProductPaymentSectionVisibility", () => {
  it("does not render subscription controls for the one-time AstroDiary paid period", () => {
    const draft = normalizeAstroDiaryProductDraft(createDefaultProductDraft("async"));

    expect(resolveProductPaymentSectionVisibility(draft, "subscription")).toEqual({
      renderSection: false,
      showPackageControls: false,
      showSubscriptionControls: false
    });
  });

  it("keeps subscription controls for recurring subscription products", () => {
    const draft = createDefaultProductDraft("sub");

    expect(resolveProductPaymentSectionVisibility(draft, "subscription")).toMatchObject({
      renderSection: true,
      showSubscriptionControls: true
    });
  });
});
