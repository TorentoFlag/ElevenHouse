import { describe, expect, it } from "vitest";
import {
  getFirstEnabledActionMenuItemId,
  getLastEnabledActionMenuItemId,
  getNextEnabledActionMenuItemId
} from "./actionMenuNavigation.js";

const items = [
  { id: "edit", disabled: false },
  { id: "duplicate", disabled: true },
  { id: "archive", disabled: false }
];

describe("actionMenuNavigation", () => {
  it("finds enabled menu items for initial focus", () => {
    expect(getFirstEnabledActionMenuItemId(items)).toBe("edit");
    expect(getLastEnabledActionMenuItemId(items)).toBe("archive");
  });

  it("moves through enabled menu items and wraps around disabled entries", () => {
    expect(getNextEnabledActionMenuItemId(items, "edit", 1)).toBe("archive");
    expect(getNextEnabledActionMenuItemId(items, "archive", 1)).toBe("edit");
    expect(getNextEnabledActionMenuItemId(items, "edit", -1)).toBe("archive");
  });

  it("returns null when every item is disabled", () => {
    const disabledItems = items.map((item) => ({ ...item, disabled: true }));

    expect(getFirstEnabledActionMenuItemId(disabledItems)).toBeNull();
    expect(getLastEnabledActionMenuItemId(disabledItems)).toBeNull();
    expect(getNextEnabledActionMenuItemId(disabledItems, "edit", 1)).toBeNull();
  });
});
