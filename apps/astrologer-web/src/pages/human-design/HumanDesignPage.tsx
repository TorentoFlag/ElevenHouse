import { HumanDesignPageView } from "./HumanDesignPageView";
import { useHumanDesignPageController } from "./useHumanDesignPageController";

export function HumanDesignPage() {
  return <HumanDesignPageView {...useHumanDesignPageController()} />;
}
