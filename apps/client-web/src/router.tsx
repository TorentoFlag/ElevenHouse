import { createBrowserRouter } from "react-router";
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
        path: "/me",
        element: <MePage />
      },
      {
        path: "*",
        element: <NotFoundPage />
      }
    ]
  }
]);
