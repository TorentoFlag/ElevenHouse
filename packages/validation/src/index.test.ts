import { describe, expect, it } from "vitest";
import {
  displayNameSchema,
  emailSchema,
  getEmailTopLevelDomain,
  isEmailCompleteWithKnownTld,
  isPopularFirstName,
  isPopularFemaleFirstName,
  isValidDisplayName,
  isValidEmail,
  normalizeFirstName,
  popularFirstNames,
  nonEmptyStringSchema,
  popularFemaleFirstNames,
  popularEmailTopLevelDomains
} from "./index";

describe("nonEmptyStringSchema", () => {
  it("trims and accepts non-empty strings", () => {
    expect(nonEmptyStringSchema.parse(" ElevenHouse ")).toBe("ElevenHouse");
  });

  it("rejects empty strings", () => {
    expect(() => nonEmptyStringSchema.parse("   ")).toThrow();
  });
});

describe("displayNameSchema", () => {
  it("trims and accepts names from 2 to 200 characters", () => {
    expect(displayNameSchema.parse(" Анна ")).toBe("Анна");
    expect(displayNameSchema.parse("А".repeat(200))).toBe("А".repeat(200));
  });

  it("rejects names shorter than 2 characters", () => {
    expect(() => displayNameSchema.parse("А")).toThrow();
    expect(() => displayNameSchema.parse("   ")).toThrow();
  });

  it("rejects names longer than 200 characters", () => {
    expect(() => displayNameSchema.parse("А".repeat(201))).toThrow();
  });
});

describe("emailSchema", () => {
  it("normalizes valid emails", () => {
    expect(emailSchema.parse("  CLIENT@example.COM ")).toBe("client@example.com");
  });

  it("rejects invalid emails", () => {
    expect(() => emailSchema.parse("not-an-email")).toThrow();
  });
});

describe("isValidDisplayName", () => {
  it("returns whether a value is a valid display name", () => {
    expect(isValidDisplayName("Анна")).toBe(true);
    expect(isValidDisplayName("А")).toBe(false);
    expect(isValidDisplayName("А".repeat(201))).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("returns whether a value is a valid email", () => {
    expect(isValidEmail("client@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });
});

describe("popularEmailTopLevelDomains", () => {
  it("contains the common auth email zones", () => {
    expect(popularEmailTopLevelDomains).toContain(".com");
    expect(popularEmailTopLevelDomains).toContain(".ru");
    expect(popularEmailTopLevelDomains).toContain(".dev");
  });
});

describe("getEmailTopLevelDomain", () => {
  it("returns normalized email top-level domain", () => {
    expect(getEmailTopLevelDomain("  CLIENT@example.COM ")).toBe(".com");
  });

  it("returns null for invalid email values", () => {
    expect(getEmailTopLevelDomain("client@example")).toBe(null);
  });
});

describe("isEmailCompleteWithKnownTld", () => {
  it("accepts valid emails with known top-level domains", () => {
    expect(isEmailCompleteWithKnownTld("client@example.com")).toBe(true);
    expect(isEmailCompleteWithKnownTld("client@example.dev")).toBe(true);
  });

  it("rejects valid emails outside the known top-level domain list", () => {
    expect(isEmailCompleteWithKnownTld("client@example.museum")).toBe(false);
  });

  it("rejects invalid emails", () => {
    expect(isEmailCompleteWithKnownTld("client@example")).toBe(false);
  });
});

describe("normalizeFirstName", () => {
  it("trims, lowercases and normalizes yo letters", () => {
    expect(normalizeFirstName("  Алёна ")).toBe("алена");
  });
});

describe("popularFemaleFirstNames", () => {
  it("contains common first-name variants", () => {
    expect(popularFemaleFirstNames).toContain("анна");
    expect(popularFemaleFirstNames).toContain("наталья");
    expect(popularFemaleFirstNames).toContain("наталия");
    expect(popularFemaleFirstNames).toContain("софья");
  });
});

describe("popularFirstNames", () => {
  it("contains common masculine first-name variants", () => {
    expect(popularFirstNames).toContain("александр");
    expect(popularFirstNames).toContain("алексей");
    expect(popularFirstNames).toContain("даниил");
    expect(popularFirstNames).toContain("данил");
    expect(popularFirstNames).toContain("федор");
    expect(popularFirstNames).toContain("мухаммад");
  });
});

describe("isPopularFirstName", () => {
  it("accepts known complete first names across common variants", () => {
    expect(isPopularFirstName("Алексей")).toBe(true);
    expect(isPopularFirstName("Фёдор")).toBe(true);
    expect(isPopularFirstName("Данил")).toBe(true);
    expect(isPopularFirstName("Анна")).toBe(true);
  });

  it("rejects partial or unknown names", () => {
    expect(isPopularFirstName("Алекс")).toBe(false);
    expect(isPopularFirstName("Неизвестный")).toBe(false);
  });
});

describe("isPopularFemaleFirstName", () => {
  it("accepts known complete first names", () => {
    expect(isPopularFemaleFirstName("Анна")).toBe(true);
    expect(isPopularFemaleFirstName("Алёна")).toBe(true);
  });

  it("rejects partial or unknown names", () => {
    expect(isPopularFemaleFirstName("Ан")).toBe(false);
    expect(isPopularFemaleFirstName("Алексей")).toBe(false);
  });
});
