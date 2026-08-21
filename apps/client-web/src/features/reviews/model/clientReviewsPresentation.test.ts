import type { ClientReviewDetail } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  createClientReviewFormSeed,
  describeClientReviewAction,
  describeReviewableInstanceKind,
  describeReviewVersionStatus
} from "./clientReviewsPresentation";

describe("clientReviewsPresentation", () => {
  it("starts a new review as named and keeps edited public version visible until pending approval", () => {
    expect(createClientReviewFormSeed(newDetail)).toEqual({
      rating: 5,
      text: "",
      publicIdentityMode: "named"
    });
    expect(describeClientReviewAction(editedDetail)).toBe("На модерации");
    expect(describeReviewVersionStatus(editedDetail.activePublicVersion)).toBe("Опубликован");
    expect(describeReviewVersionStatus(editedDetail.pendingVersion)).toBe("Ожидает модерации");
  });

  it("labels all reviewable product kinds without a later bucket", () => {
    expect(describeReviewableInstanceKind("booking")).toBe("Консультация");
    expect(describeReviewableInstanceKind("astro_calendar_service_period")).toBe("Астрокалендарь");
    expect(describeReviewableInstanceKind("async_delivery")).toBe("Письменный разбор");
    expect(describeReviewableInstanceKind("instant_delivery")).toBe("Материал");
  });
});

const instance = {
  id: "10000000-0000-4000-8000-000000000103",
  kind: "booking",
  status: "reviewable",
  title: "Прогностика на месяц",
  contextLabel: "Консультация завершена",
  receivedAt: "2026-08-20T10:00:00.000Z",
  reviewWindowClosesAt: "2026-09-03T10:00:00.000Z",
  windowPolicy: "standard_14_days_after_receipt"
} satisfies ClientReviewDetail["reviewableInstance"];

const newDetail = {
  reviewId: null,
  reviewableInstance: instance,
  activePublicVersion: null,
  pendingVersion: null,
  moderationCase: null,
  canSubmitNewVersion: true,
  canEditLatestVersion: false
} satisfies ClientReviewDetail;

const editedDetail = {
  ...newDetail,
  reviewId: "10000000-0000-4000-8000-000000000104",
  activePublicVersion: {
    id: "10000000-0000-4000-8000-000000000105",
    versionNumber: 1,
    rating: 4,
    text: "Старая опубликованная версия",
    publicIdentityMode: "named",
    moderationStatus: "approved",
    moderationReasonCode: null,
    submittedAt: "2026-08-20T10:10:00.000Z",
    decidedAt: "2026-08-20T11:10:00.000Z"
  },
  pendingVersion: {
    id: "10000000-0000-4000-8000-000000000106",
    versionNumber: 2,
    rating: 5,
    text: "Новая версия на проверке",
    publicIdentityMode: "secret_user",
    moderationStatus: "pending",
    moderationReasonCode: null,
    submittedAt: "2026-08-21T10:10:00.000Z",
    decidedAt: null
  },
  canSubmitNewVersion: false,
  canEditLatestVersion: false
} satisfies ClientReviewDetail;
