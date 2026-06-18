import { createBrowserRouter } from "react-router";
import { RequireCurrentAccount } from "./features/auth/routes/RequireCurrentAccount";
import { ClientAppLayout } from "./layouts/ClientAppLayout";
import { AuthPage } from "./pages/auth/AuthPage";
import { HomePage } from "./pages/home/HomePage";
import { MePage } from "./pages/me/MePage";
import { NotFoundPage } from "./pages/not-found/NotFoundPage";

export const router = createBrowserRouter([
  {
    element: <ClientAppLayout />,
    children: [
      {
        path: "/",
        element: <HomePage />
      },
      {
        path: "/auth",
        element: <AuthPage />
      },
      {
        element: <RequireCurrentAccount />,
        children: [
          {
            path: "/me",
            element: <MePage />
          }
        ]
      },
      {
        path: "*",
        element: <NotFoundPage />
      }
    ]
  }
]);
