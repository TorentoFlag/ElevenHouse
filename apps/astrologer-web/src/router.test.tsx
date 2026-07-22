import { isValidElement } from "react";
import { Navigate } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { RequireCurrentAccount } from "./features/auth/routes/RequireCurrentAccount";
import { AstrologerAppLayout } from "./layouts/AstrologerAppLayout";
import { AuthPage } from "./pages/auth/AuthPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { MatrixPage } from "./pages/matrix/MatrixPage";
import { NumerologyPage } from "./pages/numerology/NumerologyPage";
import { ReferencePage } from "./pages/reference/ReferencePage";
import { ProductsPage } from "./pages/products/ProductsPage";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { CalendarPage } from "./pages/calendar/CalendarPage";
import { HumanDesignPage } from "./pages/human-design/HumanDesignPage";
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
    const productsRoute = shellRoute?.children?.find((route) => route.path === "/products");
    const calendarRoute = shellRoute?.children?.find((route) => route.path === "/calendar");
    const numerologyRoute = shellRoute?.children?.find((route) => route.path === "/numerology");
    const matrixRoute = shellRoute?.children?.find((route) => route.path === "/matrix");
    const humanDesignRoute = shellRoute?.children?.find((route) => route.path === "/human-design");
    const referenceRoute = shellRoute?.children?.find((route) => route.path === "/reference");
    const settingsRoute = shellRoute?.children?.find((route) => route.path === "/settings");

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
    expect(isValidElement(productsRoute?.element) && productsRoute.element.type).toBe(ProductsPage);
    expect(isValidElement(calendarRoute?.element) && calendarRoute.element.type).toBe(CalendarPage);
    expect(isValidElement(numerologyRoute?.element) && numerologyRoute.element.type).toBe(
      NumerologyPage
    );
    expect(isValidElement(matrixRoute?.element) && matrixRoute.element.type).toBe(MatrixPage);
    expect(isValidElement(humanDesignRoute?.element) && humanDesignRoute.element.type).toBe(
      HumanDesignPage
    );
    expect(isValidElement(referenceRoute?.element) && referenceRoute.element.type).toBe(
      ReferencePage
    );
    expect(isValidElement(settingsRoute?.element) && settingsRoute.element.type).toBe(SettingsPage);
  });
});
