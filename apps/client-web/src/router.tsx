import { createBrowserRouter } from "react-router";
import { RequireCurrentAccount } from "./features/auth/routes/RequireCurrentAccount";
import { ClientAppLayout } from "./layouts/ClientAppLayout";
import { AuthPage } from "./pages/auth/AuthPage";
import { HomePage } from "./pages/home/HomePage";
import { MePage } from "./pages/me/MePage";
import { NotFoundPage } from "./pages/not-found/NotFoundPage";
import { PublicAstrologerPage } from "./pages/public-astrologer/PublicAstrologerPage";
import { clientRouteContract } from "./router.contract";

export const router = createBrowserRouter([
  {
    element: <ClientAppLayout />,
    children: [
      {
        path: clientRouteContract.home,
        element: <HomePage />
      },
      {
        path: clientRouteContract.auth,
        element: <AuthPage />
      },
      {
        path: clientRouteContract.publicAstrologer,
        element: <PublicAstrologerPage />
      },
      {
        element: <RequireCurrentAccount />,
        children: [
          {
            path: clientRouteContract.authenticatedProfile,
            element: <MePage />
          }
        ]
      },
      {
        path: clientRouteContract.notFound,
        element: <NotFoundPage />
      }
    ]
  }
]);
