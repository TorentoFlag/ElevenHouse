import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InfiniteScrollTrigger, shouldLoadMoreOnIntersect } from "./InfiniteScrollTrigger.js";

describe("InfiniteScrollTrigger", () => {
  it("renders an accessible loading sentinel only while more content is loading", () => {
    const trigger = renderToStaticMarkup(
      <InfiniteScrollTrigger
        enabled={true}
        hasMore={true}
        isLoading={true}
        loadingLabel="Загружаем еще"
        onLoadMore={vi.fn()}
      />
    );

    expect(trigger).toContain('class="ehInfiniteScrollTrigger"');
    expect(trigger).toContain("Загружаем еще");

    const idleTrigger = renderToStaticMarkup(
      <InfiniteScrollTrigger
        enabled={true}
        hasMore={true}
        isLoading={false}
        loadingLabel="Загружаем еще"
        onLoadMore={vi.fn()}
      />
    );

    expect(idleTrigger).toContain('aria-hidden="true"');
    expect(idleTrigger).not.toContain("Загружаем еще");
  });

  it("loads more only when the sentinel intersects and the trigger is ready", () => {
    expect(
      shouldLoadMoreOnIntersect({
        enabled: true,
        hasMore: true,
        isLoading: false,
        isIntersecting: true
      })
    ).toBe(true);

    expect(
      shouldLoadMoreOnIntersect({
        enabled: true,
        hasMore: true,
        isLoading: true,
        isIntersecting: true
      })
    ).toBe(false);
    expect(
      shouldLoadMoreOnIntersect({
        enabled: true,
        hasMore: false,
        isLoading: false,
        isIntersecting: true
      })
    ).toBe(false);
    expect(
      shouldLoadMoreOnIntersect({
        enabled: false,
        hasMore: true,
        isLoading: false,
        isIntersecting: true
      })
    ).toBe(false);
    expect(
      shouldLoadMoreOnIntersect({
        enabled: true,
        hasMore: true,
        isLoading: false,
        isIntersecting: false
      })
    ).toBe(false);
  });
});
