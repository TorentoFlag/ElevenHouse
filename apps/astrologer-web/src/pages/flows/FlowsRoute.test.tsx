// @vitest-environment jsdom

import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { RequireCurrentAccount } from "../../features/auth/routes/RequireCurrentAccount";
import { AstrologerAppLayout } from "../../layouts/AstrologerAppLayout";
import { FlowsPage } from "./FlowsPage";
import { astrologerRoutes } from "../../router";

describe("flows route", () => {
  it("registers /flows inside the authenticated astrologer app", () => {
    const authenticated = astrologerRoutes.find((route) =>
      isRouteElement(route.element, RequireCurrentAccount)
    );
    const layout = authenticated?.children?.find((route) =>
      isRouteElement(route.element, AstrologerAppLayout)
    );
    const flows = layout?.children?.find((route) => route.path === "/flows");

    expect(authenticated).toBeDefined();
    expect(layout).toBeDefined();
    expect(isRouteElement(flows?.element, FlowsPage)).toBe(true);
  });
});

function isRouteElement(element: unknown, component: unknown) {
  return isValidElement(element) && element.type === component;
}
