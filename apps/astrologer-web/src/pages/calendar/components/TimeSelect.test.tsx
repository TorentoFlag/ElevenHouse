import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TimeSelect } from "./TimeSelect";

describe("TimeSelect", () => {
  it("represents the contract's end-of-day 24:00 boundary", () => {
    const markup = renderToStaticMarkup(
      <TimeSelect ariaLabel="До" value={1_440} onChange={vi.fn()} />
    );

    expect(markup).toContain('<option value="1440" selected="">24:00</option>');
  });
});
