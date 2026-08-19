import { describe, expect, it } from "vitest";

import { productTemplateSeedData } from "./index";

describe("AstroDiary product template seed", () => {
  it("describes the paid period as a one-time purchase, not a monthly subscription", () => {
    const astroDiaryTemplates = productTemplateSeedData.filter(
      (template) => template.code === "astro_diary_paid_period"
    );

    expect(astroDiaryTemplates).toHaveLength(2);

    for (const template of astroDiaryTemplates) {
      expect(template.payload.type).toBe("async");
      expect(template.payload.executionMode).toBe("async");
      expect(template.payload.paymentModel).toBe("once");
      expect(template.payload.participantMode).toBe("solo");
      expect(template.payload.subscriptionPeriod).toBe("month");
      expect(template.payload.priceMinor).toBeGreaterThan(0);
      expect(template.payload.includedItems.map((item) => item.text).join("\n")).not.toMatch(
        /в месяц|per month|subscription|подпис/i
      );
    }

    expect(
      astroDiaryTemplates.find((template) => template.locale === "ru")?.payload.includedItems[0]
        ?.text
    ).toBe("4 цикла рефлексии за оплаченный период");
    expect(
      astroDiaryTemplates.find((template) => template.locale === "en")?.payload.includedItems[0]
        ?.text
    ).toBe("4 reflection cycles per paid period");
  });
});
