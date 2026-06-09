import { describe, expect, it } from "vitest";
import { z } from "@elevenhouse/validation";
import { nodeEnvSchema, parseEnv } from "./index";

describe("config", () => {
  it("defaults NODE_ENV to development", () => {
    expect(nodeEnvSchema.parse(undefined)).toBe("development");
  });

  it("parses env objects through a provided schema", () => {
    const schema = z.object({
      PORT: z.coerce.number().int().positive()
    });

    expect(parseEnv(schema, { PORT: "3001" })).toEqual({ PORT: 3001 });
  });
});
