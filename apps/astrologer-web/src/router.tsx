import { Navigate, createBrowserRouter, type RouteObject } from "react-router";
import { RequireCurrentAccount } from "./features/auth/routes/RequireCurrentAccount";
import { AstrologerAppLayout } from "./layouts/AstrologerAppLayout";
import { AuthPage } from "./pages/auth/AuthPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { NotFoundPage } from "./pages/not-found/NotFoundPage";

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
