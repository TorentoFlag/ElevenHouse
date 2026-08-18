// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../../common/i18n/astrologerCopy";
import { AstroDiaryReplyComposer } from "./AstroDiaryReplyComposer";

afterEach(cleanup);

describe("AstroDiaryReplyComposer", () => {
  it("opens a private reply draft and submits its current body for saving", () => {
    const onSave = vi.fn();
    render(
      <ControlledComposer
        copy={astrologerCopyByLocale.en.astroDiary}
        draft={null}
        error={null}
        isSaving={false}
        isPublishing={false}
        onReloadLatest={vi.fn()}
        onSave={onSave}
        onPublish={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Write reply" }));
    const textbox = screen.getByRole("textbox", { name: "Reply text" });
    fireEvent.change(textbox, { target: { value: "A considered answer" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(textbox).toHaveFocus();
    expect(onSave).toHaveBeenCalledWith("A considered answer");
  });

  it("publishes only an acknowledged server draft and announces typed errors", () => {
    const onPublish = vi.fn();
    const { rerender } = render(
      <AstroDiaryReplyComposer
        copy={astrologerCopyByLocale.en.astroDiary}
        draft={{
          draftId: "11111111-1111-4111-8111-111111111111",
          version: 2,
          body: "Saved answer"
        }}
        body="Saved answer"
        error={null}
        isSaving={false}
        isPublishing={false}
        onReloadLatest={vi.fn()}
        onBodyChange={vi.fn()}
        onSave={vi.fn()}
        onPublish={onPublish}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish reply" }));
    expect(onPublish).toHaveBeenCalledTimes(1);

    rerender(
      <AstroDiaryReplyComposer
        copy={astrologerCopyByLocale.en.astroDiary}
        draft={{
          draftId: "11111111-1111-4111-8111-111111111111",
          version: 2,
          body: "Saved answer"
        }}
        body="Saved answer"
        error="stale"
        isSaving={false}
        isPublishing={false}
        onReloadLatest={vi.fn()}
        onBodyChange={vi.fn()}
        onSave={vi.fn()}
        onPublish={onPublish}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("changed in another session");
    expect(screen.getByRole("button", { name: "Load latest" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Review draft" })).toBeVisible();
  });

  it("offers an authority refresh when the server no longer has an open response obligation", () => {
    const onReloadLatest = vi.fn();
    render(
      <AstroDiaryReplyComposer
        copy={astrologerCopyByLocale.en.astroDiary}
        draft={{
          draftId: "11111111-1111-4111-8111-111111111111",
          version: 2,
          body: "Saved answer"
        }}
        body="Saved answer"
        error="no_obligation"
        isSaving={false}
        isPublishing={false}
        onReloadLatest={onReloadLatest}
        onBodyChange={vi.fn()}
        onSave={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("response obligation is no longer open");
    fireEvent.click(screen.getByRole("button", { name: "Load latest" }));
    expect(onReloadLatest).toHaveBeenCalledTimes(1);
  });
});

function ControlledComposer(
  props: Omit<React.ComponentProps<typeof AstroDiaryReplyComposer>, "body" | "onBodyChange">
) {
  const [body, setBody] = useState("");
  return <AstroDiaryReplyComposer {...props} body={body} onBodyChange={setBody} />;
}
