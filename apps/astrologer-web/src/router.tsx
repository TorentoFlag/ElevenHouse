import { Navigate, createBrowserRouter, type RouteObject } from "react-router";
import { RequireCurrentAccount } from "./features/auth/routes/RequireCurrentAccount";
import { AstrologerAppLayout } from "./layouts/AstrologerAppLayout";
import { AuthPage } from "./pages/auth/AuthPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { FinancePage } from "./pages/finance/FinancePage";
import { NotFoundPage } from "./pages/not-found/NotFoundPage";
import { MatrixPage } from "./pages/matrix/MatrixPage";
import { NumerologyPage } from "./pages/numerology/NumerologyPage";
import { ProductsPage } from "./pages/products/ProductsPage";
import { ReferencePage } from "./pages/reference/ReferencePage";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { CalendarPage } from "./pages/calendar/CalendarPage";
import { ChartEngineRoute } from "./pages/chart-engine/ChartEngineRoute";
import { HumanDesignPage } from "./pages/human-design/HumanDesignPage";
import { InboxPage } from "./pages/inbox/InboxPage";
import { AstroCalendarPage } from "./pages/astro-calendar/AstroCalendarPage";
import { FlowsPage } from "./pages/flows/FlowsPage";

export const astrologerRoutes = [
  {
    path: "/",
    element: <Navigate to="/auth" replace />
  },
  {
    path: "/auth",
    element: <AuthPage />
  },
  {
    element: <RequireCurrentAccount />,
    children: [
      {
        element: <AstrologerAppLayout />,
        children: [
          {
            path: "/dashboard",
            element: <DashboardPage />
          },
          {
            path: "/calendar",
            element: <CalendarPage />
          },
          {
            path: "/finance",
            element: <FinancePage />
          },
          {
            path: "/flows",
            element: <FlowsPage />
          },
          {
            path: "/products",
            element: <ProductsPage />
          },
          {
            path: "/reference",
            element: <ReferencePage />
          },
          {
            path: "/inbox",
            element: <InboxPage />
          },
          {
            path: "/numerology",
            element: <NumerologyPage />
          },
          {
            path: "/matrix",
            element: <MatrixPage />
          },
          {
            path: "/human-design",
            element: <HumanDesignPage />
          },
          {
            path: "/astro-calendar",
            element: <AstroCalendarPage />
          },
          {
            path: "/chart-engine",
            element: <ChartEngineRoute />
          },
          {
            path: "/settings",
            element: <SettingsPage />
          }
        ]
      }
    ]
  },
  {
    path: "*",
    element: <NotFoundPage />
  }
] satisfies RouteObject[];

export const router = createBrowserRouter(astrologerRoutes);
