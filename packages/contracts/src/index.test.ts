import { describe, expect, it } from "vitest";
import {
  authenticatedCustomerAccountResponseSchema,
  astrologerProfileResponseSchema,
  calculationPdfJobResponseSchema,
  dictionaryCategoriesResponseSchema,
  dictionaryEntriesResponseSchema,
  healthResponseSchema,
  humanDesignPreviewRequestSchema,
  createProductRequestSchema,
  requestPasswordlessCodeRequestSchema,
  requestPasswordlessCodeResponseSchema,
  verifyPasswordlessCodeRequestSchema,
  verifyPasswordlessCodeResponseSchema
} from "./index";

describe("contracts public barrel", () => {
  it("exports health contracts", () => {
    expect(healthResponseSchema.parse).toBeTypeOf("function");
  });

  it("exports identity contracts", () => {
    expect(authenticatedCustomerAccountResponseSchema.parse).toBeTypeOf("function");
    expect(requestPasswordlessCodeRequestSchema.parse).toBeTypeOf("function");
    expect(requestPasswordlessCodeResponseSchema.parse).toBeTypeOf("function");
    expect(verifyPasswordlessCodeRequestSchema.parse).toBeTypeOf("function");
    expect(verifyPasswordlessCodeResponseSchema.parse).toBeTypeOf("function");
  });

  it("exports dictionary contracts", () => {
    expect(dictionaryCategoriesResponseSchema.parse).toBeTypeOf("function");
    expect(dictionaryEntriesResponseSchema.parse).toBeTypeOf("function");
  });

  it("exports product contracts", () => {
    expect(createProductRequestSchema.parse).toBeTypeOf("function");
  });

  it("exports astrologer profile contracts", () => {
    expect(astrologerProfileResponseSchema.parse).toBeTypeOf("function");
  });

  it("exports calculation PDF contracts", () => {
    expect(calculationPdfJobResponseSchema.parse).toBeTypeOf("function");
  });

  it("exports Human Design contracts", () => {
    expect(humanDesignPreviewRequestSchema.parse).toBeTypeOf("function");
  });
});
