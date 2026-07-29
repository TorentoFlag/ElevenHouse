import { LandingPage } from "./pages/home/LandingPage";
import { PrivacyPolicyPage } from "./pages/privacy/PrivacyPolicyPage";

export type LandingRoute = "home" | "privacy";

export function resolveLandingRoute(pathname: string): LandingRoute {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  return normalizedPath === "/privacy" ? "privacy" : "home";
}

export function App({ pathname = globalThis.location?.pathname ?? "/" }: { readonly pathname?: string } = {}) {
  return resolveLandingRoute(pathname) === "privacy" ? <PrivacyPolicyPage /> : <LandingPage />;
}
