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
import { ChartEngineRoute, ChartEngineRouteError } from "./pages/chart-engine/ChartEngineRoute";
import { HumanDesignPage } from "./pages/human-design/HumanDesignPage";
import { InboxPage } from "./pages/inbox/InboxPage";
import { AstroCalendarPage } from "./pages/astro-calendar/AstroCalendarPage";
import { AstroDiaryPage } from "./pages/astro-diary/AstroDiaryPage";
import { FlowsPage } from "./pages/flows/FlowsPage";
import { astrologerRouteContract } from "./router.contract";

export const astrologerRoutes = [
  {
    path: astrologerRouteContract.root.path,
    element: (
      <Navigate
        to={astrologerRouteContract.root.redirectTo}
        replace={astrologerRouteContract.root.replace}
      />
    )
  },
  {
    path: astrologerRouteContract.auth,
    element: <AuthPage />
  },
  {
    element: <RequireCurrentAccount />,
    children: [
      {
        path: astrologerRouteContract.protected.session,
        lazy: async () => ({ Component: (await import("./pages/session/SessionPage")).SessionPage })
      },
      {
        element: <AstrologerAppLayout />,
        children: [
          {
            path: astrologerRouteContract.protected.dashboard,
            element: <DashboardPage />
          },
          {
            path: astrologerRouteContract.protected.calendar,
            element: <CalendarPage />
          },
          {
            path: astrologerRouteContract.protected.finance,
            element: <FinancePage />
          },
          {
            path: astrologerRouteContract.protected.flows,
            element: <FlowsPage />
          },
          {
            path: astrologerRouteContract.protected.products,
            element: <ProductsPage />
          },
          {
            path: astrologerRouteContract.protected.reference,
            element: <ReferencePage />
          },
          {
            path: astrologerRouteContract.protected.inbox,
            element: <InboxPage />
          },
          {
            path: astrologerRouteContract.protected.numerology,
            element: <NumerologyPage />
          },
          {
            path: astrologerRouteContract.protected.matrix,
            element: <MatrixPage />
          },
          {
            path: astrologerRouteContract.protected.humanDesign,
            element: <HumanDesignPage />
          },
          {
            path: astrologerRouteContract.protected.astroCalendar,
            element: <AstroCalendarPage />
          },
          {
            path: astrologerRouteContract.protected.astroDiary,
            element: <AstroDiaryPage />
          },
          {
            path: astrologerRouteContract.protected.chartEngine,
            element: <ChartEngineRoute />,
            errorElement: <ChartEngineRouteError />
          },
          {
            path: astrologerRouteContract.protected.settings,
            element: <SettingsPage />
          }
        ]
      }
    ]
  },
  {
    path: astrologerRouteContract.notFound,
    element: <NotFoundPage />
  }
] satisfies RouteObject[];

export const router = createBrowserRouter(astrologerRoutes);
