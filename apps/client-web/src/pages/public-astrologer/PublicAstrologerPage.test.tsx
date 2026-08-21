// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { PublicAstrologerPage } from "./PublicAstrologerPage";

const createClientJoinIntent = vi.hoisted(() => vi.fn());
const writePendingClientJoinIntent = vi.hoisted(() => vi.fn());
const listPublicReviews = vi.hoisted(() => vi.fn());

vi.mock("../../features/client-join/api/clientJoinApi", () => ({ createClientJoinIntent }));
vi.mock("../../features/client-join/model/clientJoinStorage", () => ({
  writePendingClientJoinIntent
}));
vi.mock("../../features/reviews/api/publicReviewsApi", () => ({ listPublicReviews }));

describe("PublicAstrologerPage", () => {
  beforeEach(() => {
    createClientJoinIntent.mockReset();
    writePendingClientJoinIntent.mockReset();
    listPublicReviews.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows public reviews for the astrologer from the direct link", async () => {
    createClientJoinIntent.mockResolvedValueOnce(joinIntent);
    listPublicReviews.mockResolvedValueOnce({ items: [publicReview], nextCursor: null });

    renderPage();

    expect(await screen.findByText("Анна Соколова")).toBeVisible();
    expect(await screen.findByText("Точно и полезно.")).toBeVisible();
    expect(screen.getByText("Секретный пользователь")).toBeVisible();
    expect(screen.getByText("Спасибо за доверие.")).toBeVisible();
    expect(createClientJoinIntent).toHaveBeenCalledWith({ publicHandle: "anna" });
    expect(writePendingClientJoinIntent).toHaveBeenCalledWith(joinIntent);
    expect(listPublicReviews).toHaveBeenCalledWith({
      astrologerUserId: astrologerUserId,
      limit: 6,
      cursor: null
    });
  });

  it("keeps the direct-link page available when reviews cannot be loaded", async () => {
    createClientJoinIntent.mockResolvedValueOnce(joinIntent);
    listPublicReviews.mockRejectedValueOnce(new Error("reviews unavailable"));

    renderPage();

    expect(await screen.findByText("Анна Соколова")).toBeVisible();
    await waitFor(() => expect(screen.getByText("Отзывы временно недоступны.")).toBeVisible());
  });
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/a/anna"]}>
      <Routes>
        <Route path="/a/:handle" element={<PublicAstrologerPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const astrologerUserId = "10000000-0000-4000-8000-000000000032";

const joinIntent = {
  token: "join-intent-token-1234567890",
  astrologer: {
    userId: astrologerUserId,
    publicHandle: "anna",
    publicName: "Анна Соколова"
  },
  expiresAt: "2026-08-21T12:00:00.000Z"
};

const publicReview = {
  reviewId: "10000000-0000-4000-8000-000000000030",
  reviewableInstanceId: "10000000-0000-4000-8000-000000000031",
  astrologerUserId,
  productId: null,
  title: "Астрокалендарь",
  contextLabel: "Август 2026",
  rating: 5,
  text: "Точно и полезно.",
  author: {
    publicIdentityMode: "secret_user",
    displayName: "Секретный пользователь",
    initials: null,
    avatarUrl: null
  },
  publishedAt: "2026-08-20T10:00:00.000Z",
  astrologerReply: {
    replyId: "10000000-0000-4000-8000-000000000040",
    text: "Спасибо за доверие.",
    publishedAt: "2026-08-20T11:00:00.000Z"
  }
};
