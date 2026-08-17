import { useEffect } from "react";
import { useRouteError } from "react-router";
import { ChartEnginePage } from "../../features/charts/components/ChartEnginePage";
import styles from "../../features/charts/components/ChartEnginePage.module.css";
import { useChartEngineController } from "./useChartEngineController";

export function ChartEngineRoute() {
  return <ChartEnginePage {...useChartEngineController()} />;
}

export function ChartEngineRouteError() {
  const error = useRouteError();

  useEffect(() => {
    console.error("Chart engine route failed", error);
  }, [error]);

  return (
    <main className={styles.page}>
      <section className={styles.routeErrorFallback} role="alert">
        <h1>Не удалось выполнить расчёт</h1>
        <p>Сервис временно недоступен. Попробуйте ещё раз.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Повторить
        </button>
      </section>
    </main>
  );
}
