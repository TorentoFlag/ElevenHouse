import { MatrixPageView } from "./MatrixPageView";
import { useMatrixPageController } from "./useMatrixPageController";

export function MatrixPage() {
  return <MatrixPageView {...useMatrixPageController()} />;
}
