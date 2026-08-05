import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { PublicAstrologerPage } from "./pages/public-astrologer/PublicAstrologerPage";
import { router } from "./router";

vi.mock("react-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router")>();

  return {
    ...original,
    createBrowserRouter: vi.fn((routes: unknown) => ({ routes }))
  };
});

type TestRoute = {
  readonly path?: string;
  readonly element?: unknown;
  readonly children?: readonly TestRoute[];
};

const flattenRoutes = (routes: readonly TestRoute[]): readonly TestRoute[] =>
  routes.flatMap((route) => [route, ...flattenRoutes(route.children ?? [])]);

describe("client routes", () => {
  it("keeps the exact direct-link astrologer route in the production router", () => {
    const routes = flattenRoutes(
      (router as unknown as { readonly routes: readonly TestRoute[] }).routes
    );
    expect(routes.flatMap((route) => (route.path ? [route.path] : []))).toEqual([
      "/",
      "/auth",
      "/a/:handle",
      "/me",
      "*"
    ]);

    const publicAstrologerRoute = routes.find((route) => route.path === "/a/:handle");
    expect(
      isValidElement(publicAstrologerRoute?.element) && publicAstrologerRoute.element.type
    ).toBe(PublicAstrologerPage);
  });
});
