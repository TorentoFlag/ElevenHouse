import { useI18n } from "@elevenhouse/i18n";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";

export function DashboardPage() {
  const { dictionary } = useI18n<AstrologerCopy>();

  useDocumentTitle(dictionary.dashboard.documentTitle);

  return (
    <main className="app-shell">
      <p className="app-kicker">{dictionary.dashboard.kicker}</p>
      <h1>{dictionary.dashboard.title}</h1>
    </main>
  );
}
