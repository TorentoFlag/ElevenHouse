import { describe, expect, it } from "vitest";

import { flowNodeKindLabel } from "./flowDisplay";

describe("flow node display labels", () => {
  it("labels review trigger as first published review", () => {
    expect(flowNodeKindLabel("review_first_published", "ru")).toBe("Отзыв опубликован");
    expect(flowNodeKindLabel("review_first_published", "en")).toBe("Review published");
  });
});
