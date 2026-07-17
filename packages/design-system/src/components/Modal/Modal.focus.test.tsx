// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("Modal focus", () => {
  it("focuses the preferred field and restores the trigger", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const trigger = document.createElement("button");
    const container = document.createElement("div");
    document.body.append(trigger, container);
    trigger.focus();
    const root = createRoot(container);

    function Harness() {
      const textareaRef = useRef<HTMLTextAreaElement>(null);
      return (
        <Modal
          title="Трактовка"
          closeLabel="Закрыть"
          initialFocusRef={textareaRef}
          onClose={() => undefined}
        >
          <textarea ref={textareaRef} aria-label="Текст трактовки" />
        </Modal>
      );
    }

    act(() => root.render(<Harness />));
    expect(document.activeElement).toBe(document.querySelector("textarea"));
    act(() => root.unmount());
    expect(document.activeElement).toBe(trigger);
  });
});
