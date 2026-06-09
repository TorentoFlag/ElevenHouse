import { colorTokens } from "@elevenhouse/design-system";
import { CLIENT_WEB_APP_TITLE } from "./app-title";
import "./index.css";

export function App() {
  return (
    <main className="app-shell">
      <p className="app-kicker" style={{ color: colorTokens.accent.gold.solid }}>
        Client surface
      </p>
      <h1>{CLIENT_WEB_APP_TITLE}</h1>
    </main>
  );
}
