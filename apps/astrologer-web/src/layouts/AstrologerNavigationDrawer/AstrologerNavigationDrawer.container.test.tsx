import { describe, expect, it, vi } from "vitest";
import { AstrologerNavigationDrawer } from "./AstrologerNavigationDrawer";

const mocks = vi.hoisted(() => ({
  useI18n: vi.fn(),
  useAstrologerTariffEntitlementsQuery: vi.fn(),
  view: vi.fn()
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useState: vi.fn(() => [false, vi.fn()]) };
});
vi.mock("@elevenhouse/i18n", () => ({ useI18n: mocks.useI18n }));
vi.mock("../../features/platform-tariffs/model/useAstrologerTariffEntitlementsQuery", () => ({
  useAstrologerTariffEntitlementsQuery: mocks.useAstrologerTariffEntitlementsQuery
}));
vi.mock("./components/AstrologerNavigationDrawerView", () => ({
  AstrologerNavigationDrawerView: mocks.view
}));

describe("AstrologerNavigationDrawer", () => {
  it("fails closed while the server entitlement projection is absent", () => {
    mocks.useI18n.mockReturnValue({ dictionary: { appShell: { navigation: { items: [] } } } });
    mocks.useAstrologerTariffEntitlementsQuery.mockReturnValue({ data: undefined });

    const element = AstrologerNavigationDrawer();

    expect(element.props).toMatchObject({ canReadProducts: false });
  });

  it("uses the server read decision for products navigation", () => {
    mocks.useI18n.mockReturnValue({ dictionary: { appShell: { navigation: { items: [] } } } });
    mocks.useAstrologerTariffEntitlementsQuery.mockReturnValue({
      data: { products: { read: "read_only", mutation: "read_only" } }
    });

    const element = AstrologerNavigationDrawer();

    expect(element.props).toMatchObject({ canReadProducts: true });
  });
});
