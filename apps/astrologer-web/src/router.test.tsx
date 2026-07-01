import { isValidElement } from "react";
import { Navigate } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { RequireCurrentAccount } from "./features/auth/routes/RequireCurrentAccount";
import { AstrologerAppLayout } from "./layouts/AstrologerAppLayout";
import { AuthPage } from "./pages/auth/AuthPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { ReferencePage } from "./pages/reference/ReferencePage";
import { astrologerRoutes } from "./router";

vi.mock("react-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router")>();

  return {
    ...original,
    createBrowserRouter: vi.fn((routes: unknown) => ({ routes }))
  };
});

describe("astrologerRoutes", () => {
  it("keeps auth outside the app shell and renders workspace pages inside the protected shell", () => {
    const authRoute = astrologerRoutes.find((route) => route.path === "/auth");
    const rootRedirect = astrologerRoutes.find((route) => route.path === "/");
    const protectedRoute = astrologerRoutes.find(
      (route) => isValidElement(route.element) && route.element.type === RequireCurrentAccount
    );
    const shellRoute = protectedRoute?.children?.find(
      (route) => isValidElement(route.element) && route.element.type === AstrologerAppLayout
    );
    const dashboardRoute = shellRoute?.children?.find((route) => route.path === "/dashboard");
    const referenceRoute = shellRoute?.children?.find((route) => route.path === "/reference");

    expect(isValidElement(rootRedirect?.element) && rootRedirect.element.type).toBe(Navigate);
    expect(isValidElement(authRoute?.element) && authRoute.element.type).toBe(AuthPage);
    expect(isValidElement(protectedRoute?.element) && protectedRoute.element.type).toBe(
      RequireCurrentAccount
    );
    expect(isValidElement(shellRoute?.element) && shellRoute.element.type).toBe(
      AstrologerAppLayout
    );
    expect(isValidElement(dashboardRoute?.element) && dashboardRoute.element.type).toBe(
      DashboardPage
    );
    expect(isValidElement(referenceRoute?.element) && referenceRoute.element.type).toBe(
      ReferencePage
    );
  });
});
