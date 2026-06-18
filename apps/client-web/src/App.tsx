import "@elevenhouse/design-system/tokens.css";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { application } from "./Application";
import { router } from "./router";

export function App() {
  return (
    <QueryClientProvider client={application.queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
