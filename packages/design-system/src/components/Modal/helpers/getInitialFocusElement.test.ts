import { describe, expect, it, vi } from "vitest";
import { getInitialFocusElement } from "./getInitialFocusElement.js";

describe("getInitialFocusElement", () => {
  it("prefers an explicit focus target contained by the dialog", () => {
    const preferred = {
      focus: vi.fn(),
      hasAttribute: vi.fn(() => false),
      getAttribute: vi.fn(() => null)
    } as unknown as HTMLElement;
    const fallback = {
      focus: vi.fn(),
      hasAttribute: vi.fn(() => false),
      getAttribute: vi.fn(() => null)
    } as unknown as HTMLElement;
    const dialog = {
      contains: vi.fn((candidate) => candidate === preferred),
      querySelectorAll: vi.fn(() => [fallback])
    } as unknown as HTMLElement;

    expect(getInitialFocusElement(dialog, preferred)).toBe(preferred);
  });

  it("falls back to the first focusable control when the preferred target is external", () => {
    const external = { focus: vi.fn() } as unknown as HTMLElement;
    const fallback = {
      focus: vi.fn(),
      hasAttribute: vi.fn(() => false),
      getAttribute: vi.fn(() => null)
    } as unknown as HTMLElement;
    const dialog = {
      contains: vi.fn(() => false),
      querySelectorAll: vi.fn(() => [fallback])
    } as unknown as HTMLElement;

    expect(getInitialFocusElement(dialog, external)).toBe(fallback);
  });

  it("falls back when the preferred target is disabled", () => {
    const preferred = {
      focus: vi.fn(),
      hasAttribute: vi.fn((name: string) => name === "disabled"),
      getAttribute: vi.fn(() => null)
    } as unknown as HTMLElement;
    const fallback = {
      focus: vi.fn(),
      hasAttribute: vi.fn(() => false),
      getAttribute: vi.fn(() => null)
    } as unknown as HTMLElement;
    const dialog = {
      contains: vi.fn(() => true),
      querySelectorAll: vi.fn(() => [fallback])
    } as unknown as HTMLElement;

    expect(getInitialFocusElement(dialog, preferred)).toBe(fallback);
  });

  it("falls back to the dialog when no focusable control exists", () => {
    const dialog = {
      contains: vi.fn(() => false),
      querySelectorAll: vi.fn(() => [])
    } as unknown as HTMLElement;

    expect(getInitialFocusElement(dialog, null)).toBe(dialog);
  });
});
