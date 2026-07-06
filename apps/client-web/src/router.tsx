import { createBrowserRouter } from "react-router";
import { RequireCurrentAccount } from "./features/auth/routes/RequireCurrentAccount";
import { ClientAppLayout } from "./layouts/ClientAppLayout";
import { AuthPage } from "./pages/auth/AuthPage";
import { HomePage } from "./pages/home/HomePage";
import { MePage } from "./pages/me/MePage";
import { NotFoundPage } from "./pages/not-found/NotFoundPage";
import { PublicAstrologerPage } from "./pages/public-astrologer/PublicAstrologerPage";

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
        path: "/a/:handle",
        element: <PublicAstrologerPage />
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
