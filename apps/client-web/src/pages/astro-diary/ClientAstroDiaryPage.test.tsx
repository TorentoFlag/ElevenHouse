// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { AstroDiaryJournalSummaryResponse } from "@elevenhouse/contracts";
import { I18nProvider } from "@elevenhouse/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../common/http/HttpError";
import { clientCopyByLocale } from "../../common/i18n/clientCopy";
import { clientRouteContract } from "../../router.contract";
import { ClientAstroDiaryPage } from "./ClientAstroDiaryPage";

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("../../Application", () => ({ application: { http } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ClientAstroDiaryPage", () => {
  beforeEach(() => {
    http.get.mockReset();
    http.post.mockReset();
    http.put.mockReset();
  });

  it("does not select or load a journal owned by a different route astrologer", async () => {
    http.get.mockImplementation(async (path: string) => {
      if (path === "/me/overview") return overview;
      if (path === "/astro-diary/journals") return { journals: [otherSummary], total: 1 };
      throw new Error(`Unexpected GET ${path}`);
    });
    renderPage();
    expect(
      await screen.findByText(clientCopyByLocale.en.astroDiary.noSubscriptionDescription)
    ).toBeVisible();
    expect(http.get).not.toHaveBeenCalledWith(`/astro-diary/journals/${otherSummary.journal.id}`);
  });

  it("preserves entry text while stale authority is reloaded", async () => {
    const latest = deferred<AstroDiaryJournalSummaryResponse>();
    let detailReads = 0;
    http.get.mockImplementation(async (path: string) => {
      if (path === "/me/overview") return overview;
      if (path === "/astro-diary/journals") return { journals: [activeSummary], total: 1 };
      if (path === `/astro-diary/journals/${journalId}`) {
        detailReads += 1;
        return detailReads === 1 ? activeSummary : latest.promise;
      }
      if (path === `/astro-diary/journals/${journalId}/client-entry/draft`) {
        return { draft: null };
      }
      if (path.startsWith(`/astro-diary/journals/${journalId}/timeline?`)) {
        return { items: [], nextCursor: null, visibleMaxCursor: 0, hasMore: false };
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    http.post.mockRejectedValueOnce(new HttpError(409, { code: "stale_version" }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Write an entry" }));
    const textbox = screen.getByRole("textbox", { name: "Entry text" });
    expect(textbox).toHaveFocus();
    fireEvent.change(textbox, { target: { value: "Text that must survive" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed in another session");

    fireEvent.click(screen.getByRole("button", { name: "Load latest" }));
    await waitFor(() => expect(detailReads).toBe(2));
    latest.resolve(activeSummary);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Entry text" })).toHaveValue(
        "Text that must survive"
      )
    );
  });

  it("keeps write authority visibly pending until selected detail is confirmed", async () => {
    const detail = deferred<AstroDiaryJournalSummaryResponse>();
    http.get.mockImplementation(async (path: string) => {
      if (path === "/me/overview") return overview;
      if (path === "/astro-diary/journals") return { journals: [activeSummary], total: 1 };
      if (path === `/astro-diary/journals/${journalId}`) return detail.promise;
      if (path === `/astro-diary/journals/${journalId}/client-entry/draft`) return { draft: null };
      if (path.startsWith(`/astro-diary/journals/${journalId}/timeline?`))
        return { items: [], nextCursor: null, visibleMaxCursor: 0, hasMore: false };
      throw new Error(`Unexpected GET ${path}`);
    });
    renderPage();

    expect(await screen.findByText("Checking journal access…")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Write an entry" })).not.toBeInTheDocument();
    detail.resolve(activeSummary);
    expect(await screen.findByRole("button", { name: "Write an entry" })).toBeVisible();
  });

  it("hydrates a saved client draft after a fresh page mount and updates it instead of creating another", async () => {
    http.get.mockImplementation(async (path: string) => {
      if (path === "/me/overview") return overview;
      if (path === "/astro-diary/journals") return { journals: [activeSummary], total: 1 };
      if (path === `/astro-diary/journals/${journalId}`) return activeSummary;
      if (path === `/astro-diary/journals/${journalId}/client-entry/draft`) {
        return {
          draft: {
            draftId,
            version: 3,
            body: "Saved on the server",
            moodId: "calm",
            attachmentIds: [attachmentId]
          }
        };
      }
      if (path.startsWith(`/astro-diary/journals/${journalId}/timeline?`)) {
        return { items: [], nextCursor: null, visibleMaxCursor: 0, hasMore: false };
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    http.put.mockResolvedValueOnce({ outcome: "applied", draftId, version: 4 });
    renderPage();

    const textbox = await screen.findByRole("textbox", { name: "Entry text" });
    expect(textbox).toHaveValue("Saved on the server");
    fireEvent.change(textbox, { target: { value: "Continue after reload" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith(
        expect.stringContaining(`/client-entry/drafts/${draftId}`),
        expect.objectContaining({
          body: "Continue after reload",
          expectedDraftVersion: 3,
          attachmentIds: [attachmentId]
        }),
        expect.anything()
      )
    );
    expect(http.post).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/client-entry\/drafts$/),
      expect.anything(),
      expect.anything()
    );
  });

  it("creates, updates, and publishes only a server-acknowledged draft", async () => {
    let journalVersion = 4;
    let serverDraft: {
      draftId: string;
      version: number;
      body: string;
      moodId: "calm" | null;
      attachmentIds: readonly string[];
    } | null = null;
    http.get.mockImplementation(async (path: string) => {
      if (path === "/me/overview") return overview;
      if (path === "/astro-diary/journals")
        return {
          journals: [
            { ...activeSummary, journal: { ...activeSummary.journal, version: journalVersion } }
          ],
          total: 1
        };
      if (path === `/astro-diary/journals/${journalId}`)
        return { ...activeSummary, journal: { ...activeSummary.journal, version: journalVersion } };
      if (path === `/astro-diary/journals/${journalId}/client-entry/draft`)
        return { draft: serverDraft };
      if (path.startsWith(`/astro-diary/journals/${journalId}/timeline?`))
        return { items: [], nextCursor: null, visibleMaxCursor: 0, hasMore: false };
      throw new Error(`Unexpected GET ${path}`);
    });
    http.post.mockImplementation(async (path: string) => {
      if (path.endsWith("/client-entry/drafts")) {
        journalVersion = 5;
        serverDraft = {
          draftId,
          version: 1,
          body: "First version",
          moodId: null,
          attachmentIds: []
        };
        return { outcome: "applied", draftId, version: 1 };
      }
      if (path.endsWith(`/client-entry/drafts/${draftId}/publish`))
        return { outcome: "applied", eventIds: [] };
      throw new Error(`Unexpected POST ${path}`);
    });
    http.put.mockImplementation(async () => {
      journalVersion = 6;
      serverDraft = {
        draftId,
        version: 2,
        body: "Second version",
        moodId: null,
        attachmentIds: []
      };
      return { outcome: "applied", draftId, version: 2 };
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Write an entry" }));
    const textbox = screen.getByRole("textbox", { name: "Entry text" });
    fireEvent.change(textbox, { target: { value: "First version" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/client-entry\/drafts$/),
        expect.objectContaining({ body: "First version", expectedJournalVersion: 4 }),
        expect.anything()
      )
    );

    fireEvent.change(textbox, { target: { value: "Second version" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith(
        expect.stringContaining(draftId),
        expect.objectContaining({ body: "Second version", expectedDraftVersion: 1 }),
        expect.anything()
      )
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Publish entry" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "Publish entry" }));
    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/publish$/),
        expect.objectContaining({ expectedDraftVersion: 2 }),
        expect.anything()
      )
    );
  });

  it("uploads a private attachment and saves the returned media id with the client draft", async () => {
    http.get.mockImplementation(async (path: string) => {
      if (path === "/me/overview") return overview;
      if (path === "/astro-diary/journals") return { journals: [activeSummary], total: 1 };
      if (path === `/astro-diary/journals/${journalId}`) return activeSummary;
      if (path === `/astro-diary/journals/${journalId}/client-entry/draft`) return { draft: null };
      if (path.startsWith(`/astro-diary/journals/${journalId}/timeline?`)) {
        return { items: [], nextCursor: null, visibleMaxCursor: 0, hasMore: false };
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    http.post.mockImplementation(async (path: string) => {
      if (path.endsWith("/media/upload-intents")) {
        return {
          mediaId: attachmentId,
          status: "uploading",
          upload: {
            url: "https://storage.local/client-note.pdf",
            method: "PUT",
            headers: { "content-type": "application/pdf" },
            expiresAt: "2026-08-18T10:15:00.000Z"
          }
        };
      }
      if (path.endsWith(`/media/${attachmentId}/complete`)) {
        return {
          mediaId: attachmentId,
          status: "ready",
          purpose: "astro_diary_attachment",
          mimeType: "application/pdf",
          sizeBytes: 12,
          checksumSha256: null,
          width: null,
          height: null
        };
      }
      if (path.endsWith("/client-entry/drafts")) {
        return { outcome: "applied", draftId, version: 1 };
      }
      throw new Error(`Unexpected POST ${path}`);
    });
    const uploadFetch = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", uploadFetch);

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Write an entry" }));
    fireEvent.change(screen.getByLabelText("Attach file"), {
      target: { files: [new File(["client note"], "client-note.pdf", { type: "application/pdf" })] }
    });
    await waitFor(() => expect(uploadFetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("client-note.pdf")).toBeVisible();

    fireEvent.change(screen.getByRole("textbox", { name: "Entry text" }), {
      target: { value: "Entry with attachment" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/client-entry\/drafts$/),
        expect.objectContaining({
          body: "Entry with attachment",
          attachmentIds: [attachmentId]
        }),
        expect.anything()
      )
    );
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider
        dictionaries={clientCopyByLocale}
        initialLocale="en"
        storage={null}
        documentElement={null}
      >
        <MemoryRouter initialEntries={[`/me/astrologers/${astrologerId}/journal`]}>
          <Routes>
            <Route
              path={clientRouteContract.authenticatedAstroDiary}
              element={<ClientAstroDiaryPage />}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

const astrologerId = "41111111-1111-4111-8111-111111111111";
const journalId = "11111111-1111-4111-8111-111111111111";
const draftId = "21111111-1111-4111-8111-111111111111";
const attachmentId = "22111111-1111-4111-8111-111111111111";
const overview = {
  astrologers: [
    {
      astrologerUserId: astrologerId,
      publicName: "Mira",
      publicHandle: "mira",
      relationshipStatus: "active",
      firstLinkedAt: "2026-08-01T00:00:00.000Z",
      lastLinkedAt: "2026-08-18T00:00:00.000Z"
    }
  ],
  birthData: null,
  relatedBirthProfiles: [],
  summary: {
    activeSubscriptionCount: 1,
    availableMaterialCount: 0,
    directLinkOnly: true,
    unreadNotificationCount: 0,
    upcomingBookingCount: 0
  }
};
const activeSummary = {
  journal: {
    id: journalId,
    relationshipId: "31111111-1111-4111-8111-111111111111",
    journalEpochId: "51111111-1111-4111-8111-111111111111",
    astrologerUserId: astrologerId,
    clientUserId: "61111111-1111-4111-8111-111111111111",
    state: "active",
    version: 4,
    createdAt: "2026-08-18T10:00:00.000Z"
  },
  currentCycle: null,
  currentObligation: null,
  access: {
    mode: "active",
    subscriptionId: "71111111-1111-4111-8111-111111111111",
    subscriptionState: "active",
    currentPeriod: {
      id: "81111111-1111-4111-8111-111111111111",
      sequence: 1,
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-09-01T00:00:00.000Z"
    },
    allowance: {
      periodId: "81111111-1111-4111-8111-111111111111",
      total: 2,
      available: 2,
      reserved: 0,
      consumed: 0,
      released: 0
    }
  },
  unreadCount: 0,
  visibleMaxCursor: 0
} satisfies AstroDiaryJournalSummaryResponse;
const otherSummary = {
  ...activeSummary,
  journal: {
    ...activeSummary.journal,
    id: "91111111-1111-4111-8111-111111111111",
    astrologerUserId: "a1111111-1111-4111-8111-111111111111"
  }
} satisfies AstroDiaryJournalSummaryResponse;
