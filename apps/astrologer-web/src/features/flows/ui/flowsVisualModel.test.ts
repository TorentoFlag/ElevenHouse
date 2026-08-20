import { describe, expect, it } from "vitest";

import { getFlowNodeVisual } from "./flowsVisualModel";

describe("flow visual model", () => {
  it("uses first published review copy for the review trigger", () => {
    expect(getFlowNodeVisual("review_first_published", "ru")).toMatchObject({
      label: "Отзыв опубликован",
      tone: "trigger"
    });
    expect(getFlowNodeVisual("review_first_published", "en")).toMatchObject({
      label: "Review published",
      tone: "trigger"
    });
  });
});
