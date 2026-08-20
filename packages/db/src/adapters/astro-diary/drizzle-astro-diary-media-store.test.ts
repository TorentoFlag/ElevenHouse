import { describe, expect, it } from "vitest";

import { createDrizzleAstroDiaryMediaStore } from "./drizzle-astro-diary-media-store";

describe("Drizzle AstroDiary media store export", () => {
  it("exposes the journal-scoped media persistence factory", () => {
    expect(createDrizzleAstroDiaryMediaStore).toBeTypeOf("function");
  });
});
