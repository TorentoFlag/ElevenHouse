import { describe, expect, it } from "vitest";
import {
  authenticatedCustomerAccountResponseSchema,
  healthResponseSchema,
  loginCustomerAccountRequestSchema,
  registerCustomerAccountRequestSchema,
  registerCustomerAccountResponseSchema
} from "./index";

describe("contracts public barrel", () => {
  it("exports health contracts", () => {
    expect(healthResponseSchema.parse).toBeTypeOf("function");
  });

  it("exports identity contracts", () => {
    expect(authenticatedCustomerAccountResponseSchema.parse).toBeTypeOf("function");
    expect(loginCustomerAccountRequestSchema.parse).toBeTypeOf("function");
    expect(registerCustomerAccountRequestSchema.parse).toBeTypeOf("function");
    expect(registerCustomerAccountResponseSchema.parse).toBeTypeOf("function");
  });
});
