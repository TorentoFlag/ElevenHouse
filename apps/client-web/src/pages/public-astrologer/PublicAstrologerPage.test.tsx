// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { StrictMode } from "react";
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
    listPublicReviews.mockResolvedValueOnce({
      items: [publicReview, secondPublicReview],
      nextCursor: null
    });

    renderPage();

    expect(await screen.findByText("Анна Соколова")).toBeVisible();
    expect(await screen.findByText("Точно и полезно.")).toBeVisible();
    expect(screen.getByText("Секретный пользователь")).toBeVisible();
    expect(screen.getByText("Спасибо за доверие.")).toBeVisible();
    expect(screen.getByText("4,5")).toBeVisible();
    expect(screen.getByText("2 отзыва")).toBeVisible();
    expect(screen.getByText("5 звезд")).toBeVisible();
    expect(screen.getByText("4 звезды")).toBeVisible();
    expect(screen.getByLabelText("Оценка 5 из 5")).toBeVisible();
    expect(screen.getByLabelText("Оценка 4 из 5")).toBeVisible();
    expect(screen.getByText("СП")).toBeVisible();
    expect(screen.getByText("МИ")).toBeVisible();
    expect(createClientJoinIntent).toHaveBeenCalledWith({ publicHandle: "anna" });
    expect(writePendingClientJoinIntent).toHaveBeenCalledWith(joinIntent);
    expect(listPublicReviews).toHaveBeenCalledWith({
      astrologerUserId: astrologerUserId,
      limit: 50,
      cursor: null
    });
  });

  it("filters public reviews by rating and opens the all reviews dialog", async () => {
    createClientJoinIntent.mockResolvedValueOnce(joinIntent);
    listPublicReviews.mockResolvedValueOnce({
      items: [publicReview, secondPublicReview],
      nextCursor: null
    });

    renderPage();

    expect(await screen.findByText("Точно и полезно.")).toBeVisible();
    expect(screen.getByText("Хороший разбор.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Показать отзывы с оценкой 4" }));
    expect(screen.queryByText("Точно и полезно.")).not.toBeInTheDocument();
    expect(screen.getByText("Хороший разбор.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Все отзывы" }));
    expect(screen.getByText("Точно и полезно.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Открыть модальное окно всех отзывов" }));
    expect(screen.getByRole("dialog", { name: "Все отзывы клиентов" })).toBeVisible();
    expect(screen.getAllByText("Хороший разбор.").length).toBeGreaterThan(1);

    fireEvent.click(screen.getAllByRole("button", { name: "5 звезд" }).at(-1)!);
    expect(screen.getAllByText("Точно и полезно.").length).toBeGreaterThan(1);
    expect(screen.queryByText("Хороший разбор.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Закрыть все отзывы" }));
    expect(screen.queryByRole("dialog", { name: "Все отзывы клиентов" })).not.toBeInTheDocument();
  });

  it("keeps the direct-link page available when reviews cannot be loaded", async () => {
    createClientJoinIntent.mockResolvedValueOnce(joinIntent);
    listPublicReviews.mockRejectedValueOnce(new Error("reviews unavailable"));

    renderPage();

    expect(await screen.findByText("Анна Соколова")).toBeVisible();
    await waitFor(() => expect(screen.getByText("Отзывы временно недоступны.")).toBeVisible());
  });

  it("deduplicates the direct-link join intent request during StrictMode remount", async () => {
    let resolveJoinIntent: (value: typeof joinIntent) => void = () => undefined;
    createClientJoinIntent.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveJoinIntent = resolve;
      })
    );
    listPublicReviews.mockResolvedValueOnce({ items: [], nextCursor: null });

    renderPage({ strict: true });

    expect(createClientJoinIntent).toHaveBeenCalledTimes(1);
    resolveJoinIntent(joinIntent);

    expect(await screen.findByText("Анна Соколова")).toBeVisible();
    await waitFor(() => expect(listPublicReviews).toHaveBeenCalledTimes(1));
  });
});

function renderPage(options: { readonly strict?: boolean } = {}) {
  const page = (
    <MemoryRouter initialEntries={["/a/anna"]}>
      <Routes>
        <Route path="/a/:handle" element={<PublicAstrologerPage />} />
      </Routes>
    </MemoryRouter>
  );
  render(options.strict ? <StrictMode>{page}</StrictMode> : page);
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

const secondPublicReview = {
  ...publicReview,
  reviewId: "10000000-0000-4000-8000-000000000041",
  reviewableInstanceId: "10000000-0000-4000-8000-000000000042",
  title: "Соляр",
  contextLabel: "Сентябрь 2026",
  rating: 4,
  text: "Хороший разбор.",
  author: {
    publicIdentityMode: "named",
    displayName: "Мария Иванова",
    initials: "МИ",
    avatarUrl: null
  },
  astrologerReply: null
};
