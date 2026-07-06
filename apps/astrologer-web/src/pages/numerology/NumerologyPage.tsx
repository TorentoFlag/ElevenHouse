import { NumerologyPageView } from "./NumerologyPageView";
import { useNumerologyPageController } from "./useNumerologyPageController";

export function NumerologyPage() {
  return <NumerologyPageView {...useNumerologyPageController()} />;
}
