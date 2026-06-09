import { colorTokens } from "@elevenhouse/design-system";
import { ADMIN_WEB_APP_TITLE } from "./app-title";
import "./index.css";

export function App() {
  return (
    <main className="app-shell">
      <p className="app-kicker" style={{ color: colorTokens.status.info.solid }}>
        Admin surface
      </p>
      <h1>{ADMIN_WEB_APP_TITLE}</h1>
    </main>
  );
}
