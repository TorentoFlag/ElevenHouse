import "./index.css";
import { FinancePoliciesRoute } from "./pages/finance-policies/FinancePoliciesRoute";
import { PlatformTariffsPage } from "./features/platform-tariffs/ui/PlatformTariffsPage";

export type AdminScreen = "finance" | "tariffs";

export function selectAdminScreen(search: string): AdminScreen {
  return new URLSearchParams(search).get("section") === "tariffs" ? "tariffs" : "finance";
}

export function App() {
  const search = typeof window === "undefined" ? "" : window.location.search;
  return selectAdminScreen(search) === "tariffs" ? <PlatformTariffsPage /> : <FinancePoliciesRoute />;
}
