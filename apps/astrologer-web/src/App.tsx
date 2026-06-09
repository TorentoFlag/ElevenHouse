import { colorTokens } from "@elevenhouse/design-system";
import { ASTROLOGER_WEB_APP_TITLE } from "./app-title";
import "./index.css";

export function App() {
  return (
    <main className="app-shell">
      <p className="app-kicker" style={{ color: colorTokens.accent.amethyst.solid }}>
        Astrologer surface
      </p>
      <h1>{ASTROLOGER_WEB_APP_TITLE}</h1>
    </main>
  );
}
