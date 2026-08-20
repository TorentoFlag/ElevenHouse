// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { astrologerRouteContract } from "../../router.contract";
import { astrologerRoutes } from "../../router";

describe("clients routes", () => {
  it("declares protected list and deep-link detail routes", () => {
    expect(astrologerRouteContract.protected.clients).toBe("/clients");
    expect(astrologerRouteContract.protected.clientDetail).toBe("/clients/:clientUserId");
    expect(routePaths(astrologerRoutes)).toEqual(
      expect.arrayContaining(["/clients", "/clients/:clientUserId"])
    );
  });
});

function routePaths(
  routes: readonly { readonly path?: string; readonly children?: readonly unknown[] }[]
): readonly string[] {
  return routes.flatMap((route) => [
    ...(route.path ? [route.path] : []),
    ...(route.children ? routePaths(route.children as readonly { readonly path?: string; readonly children?: readonly unknown[] }[]) : [])
  ]);
}
