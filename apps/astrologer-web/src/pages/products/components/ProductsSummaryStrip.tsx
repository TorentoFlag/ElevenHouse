import type { ProductSummaryResponse } from "@elevenhouse/contracts";
import type { ProductLocale } from "../../../features/products/model/productCopy";
import { formatMoneyMinor } from "../../../features/products/model/productFormatting";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import styles from "../ProductsPage.module.css";

type ProductsSummaryCopy = AstrologerCopy["products"]["summary"];

export type ProductsSummaryStripProps = {
  readonly copy: ProductsSummaryCopy;
  readonly locale: ProductLocale;
  readonly summary: ProductSummaryResponse | null;
};

export function ProductsSummaryStrip({ copy, locale, summary }: ProductsSummaryStripProps) {
  const analyticsUnavailable = summary?.analyticsStatus === "unavailable";
  const metrics = [
    {
      label: copy.activeLabel,
      value: summary ? `${summary.active} из ${summary.total}` : "0 из 0"
    },
    {
      label: copy.salesLabel,
      value: analyticsUnavailable ? "—" : String(summary?.totalSalesCount ?? 0)
    },
    {
      label: copy.revenueLabel,
      value: analyticsUnavailable
        ? "—"
        : formatMoneyMinor(summary?.grossRevenueMinor ?? 0, summary?.currency ?? "RUB", locale)
    },
    {
      label: copy.bestsellerLabel,
      value: summary?.bestseller?.title ?? copy.emptyBestseller
    }
  ];

  return (
    <div className={styles.summaryStrip}>
      {metrics.map((metric) => (
        <div key={metric.label} className={styles.summaryMetric}>
          <span className={styles.summaryLabel}>{metric.label}</span>
          <span className={styles.summaryValue}>{metric.value}</span>
        </div>
      ))}
    </div>
  );
}
