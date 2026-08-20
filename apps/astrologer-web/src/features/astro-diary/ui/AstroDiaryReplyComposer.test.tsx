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
        attachments={[]}
        attachmentError={false}
        isUploadingAttachment={false}
        error={null}
        isSaving={false}
        isPublishing={false}
        onAttachFile={vi.fn()}
        onRemoveAttachment={vi.fn()}
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
    expect(onSave).toHaveBeenCalledWith("A considered answer", []);
  });

  it("submits uploaded attachment ids with the reply draft", () => {
    const onSave = vi.fn();
    const onAttachFile = vi.fn();
    render(
      <ControlledComposer
        copy={astrologerCopyByLocale.en.astroDiary}
        draft={null}
        attachments={[
          {
            mediaId: "21111111-1111-4111-8111-111111111111",
            fileName: "voice.ogg",
            purpose: "astro_diary_voice"
          }
        ]}
        attachmentError={false}
        isUploadingAttachment={false}
        error={null}
        isSaving={false}
        isPublishing={false}
        onAttachFile={onAttachFile}
        onRemoveAttachment={vi.fn()}
        onReloadLatest={vi.fn()}
        onSave={onSave}
        onPublish={vi.fn()}
      />
    );

    const textbox = screen.getByRole("textbox", { name: "Reply text" });
    fireEvent.change(textbox, { target: { value: "Reply with a voice note" } });
    expect(screen.getByText("voice.ogg")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(onSave).toHaveBeenCalledWith("Reply with a voice note", [
      "21111111-1111-4111-8111-111111111111"
    ]);
  });

  it("publishes only an acknowledged server draft and announces typed errors", () => {
    const onPublish = vi.fn();
    const { rerender } = render(
      <AstroDiaryReplyComposer
        copy={astrologerCopyByLocale.en.astroDiary}
        draft={{
          draftId: "11111111-1111-4111-8111-111111111111",
          version: 2,
          body: "Saved answer",
          attachmentIds: []
        }}
        body="Saved answer"
        attachments={[]}
        attachmentError={false}
        isUploadingAttachment={false}
        error={null}
        isSaving={false}
        isPublishing={false}
        onReloadLatest={vi.fn()}
        onBodyChange={vi.fn()}
        onAttachFile={vi.fn()}
        onRemoveAttachment={vi.fn()}
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
          body: "Saved answer",
          attachmentIds: []
        }}
        body="Saved answer"
        attachments={[]}
        attachmentError={false}
        isUploadingAttachment={false}
        error="stale"
        isSaving={false}
        isPublishing={false}
        onReloadLatest={vi.fn()}
        onBodyChange={vi.fn()}
        onAttachFile={vi.fn()}
        onRemoveAttachment={vi.fn()}
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
          body: "Saved answer",
          attachmentIds: []
        }}
        body="Saved answer"
        attachments={[]}
        attachmentError={false}
        isUploadingAttachment={false}
        error="no_obligation"
        isSaving={false}
        isPublishing={false}
        onReloadLatest={onReloadLatest}
        onBodyChange={vi.fn()}
        onAttachFile={vi.fn()}
        onRemoveAttachment={vi.fn()}
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
