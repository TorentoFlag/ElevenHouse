import "./index.css";
import { FinancePoliciesRoute } from "./pages/finance-policies/FinancePoliciesRoute";
import { PlatformTariffsPage } from "./features/platform-tariffs/ui/PlatformTariffsPage";
import { AdminReviewsPage } from "./features/reviews/ui/AdminReviewsPage";

export type AdminScreen = "finance" | "tariffs" | "reviews";

export function selectAdminScreen(search: string): AdminScreen {
  const section = new URLSearchParams(search).get("section");
  if (section === "tariffs") return "tariffs";
  if (section === "reviews") return "reviews";
  return "finance";
}

export function App() {
  const search = typeof window === "undefined" ? "" : window.location.search;
  const screen = selectAdminScreen(search);
  if (screen === "tariffs") return <PlatformTariffsPage />;
  if (screen === "reviews") return <AdminReviewsPage />;
  return <FinancePoliciesRoute />;
}
