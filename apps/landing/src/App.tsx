import { LandingPage } from "./pages/home/LandingPage";
import { PersonalDataProcessingPolicyPage } from "./pages/personal-data-processing/PersonalDataProcessingPolicyPage";
import { PrivacyPolicyPage } from "./pages/privacy/PrivacyPolicyPage";

export type LandingRoute = "home" | "privacy" | "personalDataProcessing";

export function resolveLandingRoute(pathname: string): LandingRoute {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  if (normalizedPath === "/privacy") return "privacy";
  if (normalizedPath === "/personal-data-processing") return "personalDataProcessing";

  return "home";
}

export function App({
  pathname = globalThis.location?.pathname ?? "/"
}: { readonly pathname?: string } = {}) {
  const route = resolveLandingRoute(pathname);

  if (route === "privacy") return <PrivacyPolicyPage />;
  if (route === "personalDataProcessing") return <PersonalDataProcessingPolicyPage />;

  return <LandingPage />;
}
