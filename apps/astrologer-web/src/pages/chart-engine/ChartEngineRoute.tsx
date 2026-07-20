import { ChartEnginePage } from "../../features/charts/components/ChartEnginePage";
import { useChartEngineController } from "./useChartEngineController";

export function ChartEngineRoute() {
  return <ChartEnginePage {...useChartEngineController()} />;
}
