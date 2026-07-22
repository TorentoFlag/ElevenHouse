import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TimeSelect } from "./TimeSelect";

describe("TimeSelect", () => {
  it("represents the contract's end-of-day 24:00 boundary", () => {
    const markup = renderToStaticMarkup(
      <TimeSelect ariaLabel="До" value={1_440} onChange={vi.fn()} />
    );

    expect(markup).toContain('value="24:00"');
  });

  it("uses a compact editable input instead of rendering every quarter-hour option", () => {
    const markup = renderToStaticMarkup(
      <TimeSelect ariaLabel="С" value={540} onChange={vi.fn()} />
    );

    expect(markup).toContain('inputMode="numeric"');
    expect(markup).not.toContain("<option");
  });
});
