import { describe, expect, it } from "vitest";
import { selectAdminScreen } from "./App";

describe("selectAdminScreen", () => {
  it("routes reviews section without changing existing defaults", () => {
    expect(selectAdminScreen("?section=reviews")).toBe("reviews");
    expect(selectAdminScreen("?section=tariffs")).toBe("tariffs");
    expect(selectAdminScreen("?section=finance")).toBe("finance");
    expect(selectAdminScreen("")).toBe("finance");
  });
});
