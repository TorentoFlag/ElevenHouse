import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { bindPopoverDismissal, handlePopoverEscape, Popover } from "./Popover.js";

const popoverCss = readFileSync(
  fileURLToPath(new URL("./Popover.css", import.meta.url)),
  "utf8"
);

describe("Popover", () => {
  it("renders an accessible closed disclosure", () => {
    const markup = renderToStaticMarkup(
      <Popover>
        <Popover.Trigger>Расчёты</Popover.Trigger>
        <Popover.Content role="group">Сохранённые расчёты</Popover.Content>
      </Popover>
    );

    expect(markup).toContain('class="ehPopover"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("aria-controls=");
    expect(markup).not.toContain("Сохранённые расчёты");
  });

  it("links an open trigger to aligned arbitrary content", () => {
    const markup = renderToStaticMarkup(
      <Popover defaultOpen>
        <Popover.Trigger>Расчёты</Popover.Trigger>
        <Popover.Content align="start" role="group">
          Сохранённые расчёты
        </Popover.Content>
      </Popover>
    );
    const contentId = markup.match(/aria-controls="([^"]+)"/)?.[1];

    expect(contentId).toBeTruthy();
    expect(markup).toContain(`id="${contentId}"`);
    expect(markup).toContain('data-align="start"');
    expect(markup).toContain('role="group"');
    expect(markup).toContain("Сохранённые расчёты");
  });

  it("keeps a disabled trigger closed", () => {
    const markup = renderToStaticMarkup(
      <Popover>
        <Popover.Trigger disabled>Расчёты</Popover.Trigger>
        <Popover.Content>Сохранённые расчёты</Popover.Content>
      </Popover>
    );

    expect(markup).toContain("disabled");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("Сохранённые расчёты");
  });

  it("captures outside pointers and removes the matching listener", () => {
    const listeners = new Map<string, EventListener>();
    const addEventListener = vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === "function") listeners.set(type, listener);
      }
    );
    const removeEventListener = vi.fn();
    const documentTarget = {
      addEventListener,
      removeEventListener
    } as unknown as Pick<Document, "addEventListener" | "removeEventListener">;
    const insideTarget = {} as EventTarget;
    const outsideTarget = {} as EventTarget;
    const root = {
      contains: (target: Node | null) => target === insideTarget
    } as Pick<HTMLElement, "contains">;
    const onDismiss = vi.fn();
    const cleanup = bindPopoverDismissal(documentTarget, root, onDismiss);
    const pointerDown = requiredListener(listeners, "pointerdown");

    pointerDown({ target: insideTarget } as PointerEvent);
    expect(onDismiss).not.toHaveBeenCalled();

    pointerDown({ target: outsideTarget } as PointerEvent);
    expect(onDismiss).toHaveBeenCalledWith("outside-pointer");

    expect(addEventListener).toHaveBeenCalledWith("pointerdown", pointerDown, true);
    expect(addEventListener).not.toHaveBeenCalledWith("keydown", expect.anything());

    cleanup();
    expect(removeEventListener).toHaveBeenCalledWith("pointerdown", pointerDown, true);
  });

  it("handles Escape at one popover root before ancestor bubble handlers", () => {
    const calls: string[] = [];
    const trigger = { focus: () => calls.push("focus") } as Pick<HTMLButtonElement, "focus">;
    const onDismiss = vi.fn((reason: string) => calls.push(`dismiss:${reason}`));

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const handled = handlePopoverEscape(
      { key: "Escape", defaultPrevented: false, preventDefault, stopPropagation },
      trigger,
      onDismiss
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(calls).toEqual(["dismiss:escape", "focus"]);
  });

  it("defines positioning hooks without prescribing surface visuals", () => {
    expect(popoverCss).toContain(".ehPopover");
    expect(popoverCss).toContain(".ehPopover__content");
    expect(popoverCss).toContain(".ehPopover__content--start");
    expect(popoverCss).toContain(".ehPopover__content--end");
    expect(popoverCss).not.toContain("background:");
    expect(popoverCss).not.toContain("box-shadow:");
  });
});

function requiredListener(listeners: Map<string, EventListener>, type: string): EventListener {
  const listener = listeners.get(type);
  if (!listener) throw new Error(`Listener not registered: ${type}`);
  return listener;
}
