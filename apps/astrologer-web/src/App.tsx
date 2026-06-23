import "@elevenhouse/design-system/tokens.css";
import "./index.css";
import { I18nProvider } from "@elevenhouse/i18n";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { application } from "./Application";
import { astrologerCopyByLocale } from "./common/i18n/astrologerCopy";
import { router } from "./router";

export function App() {
  return (
    <QueryClientProvider client={application.queryClient}>
      <I18nProvider dictionaries={astrologerCopyByLocale}>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>
  );
}
