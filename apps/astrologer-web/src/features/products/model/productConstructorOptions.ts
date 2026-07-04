import type {
  ProductAccessGrant,
  ProductDeliveryFormat,
  ProductExecutionMode,
  ProductMethod,
  ProductParticipantMode,
  ProductPaymentModel,
  ProductRequiredClientData,
  ProductSubscriptionPeriod
} from "@elevenhouse/contracts";
import type { IconName } from "@elevenhouse/design-system/icons/Icon";

export type ProductConstructorOption<TValue extends string> = {
  readonly value: TValue;
  readonly iconName: IconName;
};

export const productDeliveryFormatOptions = [
  { value: "video", iconName: "video" },
  { value: "audio", iconName: "mic" },
  { value: "chat", iconName: "chat" },
  { value: "text", iconName: "content" },
  { value: "file", iconName: "fileDown" },
  { value: "channel", iconName: "globe" }
] satisfies readonly ProductConstructorOption<ProductDeliveryFormat>[];

export const productExecutionModeOptions = [
  { value: "live", iconName: "calendar" },
  { value: "async", iconName: "clock" },
  { value: "instant", iconName: "lightning" }
] satisfies readonly ProductConstructorOption<ProductExecutionMode>[];

export const productPaymentModelOptions = [
  { value: "once", iconName: "wallet" },
  { value: "pack", iconName: "box" },
  { value: "sub", iconName: "refresh" },
  { value: "free", iconName: "sparkle" }
] satisfies readonly ProductConstructorOption<ProductPaymentModel>[];

export const productSubscriptionPeriodOptions = [
  { value: "week", iconName: "refresh" },
  { value: "month", iconName: "refresh" },
  { value: "year", iconName: "refresh" }
] satisfies readonly ProductConstructorOption<ProductSubscriptionPeriod>[];

export const productParticipantModeOptions = [
  { value: "solo", iconName: "verified" },
  { value: "group", iconName: "users" },
  { value: "gift", iconName: "gift" }
] satisfies readonly ProductConstructorOption<ProductParticipantMode>[];

export const productRequiredClientDataOptions = [
  { value: "chart1", iconName: "orbit" },
  { value: "cities", iconName: "map" },
  { value: "chart2", iconName: "chat" },
  { value: "question", iconName: "chat" },
  { value: "event", iconName: "content" }
] satisfies readonly ProductConstructorOption<ProductRequiredClientData>[];

export const productMethodOptions = [
  { value: "natal", iconName: "orbit" },
  { value: "forecast", iconName: "refresh" },
  { value: "synastry", iconName: "chat" },
  { value: "child", iconName: "verified" },
  { value: "numerology", iconName: "content" },
  { value: "matrix", iconName: "orbit" },
  { value: "humandesign", iconName: "flow" }
] satisfies readonly ProductConstructorOption<ProductMethod>[];

export const productAccessGrantOptions = [
  { value: "content", iconName: "content" },
  { value: "channel", iconName: "flow" },
  { value: "records", iconName: "video" },
  { value: "course", iconName: "box" },
  { value: "community", iconName: "chat" },
  { value: "journal", iconName: "reference" }
] satisfies readonly ProductConstructorOption<ProductAccessGrant>[];

export const productIconNames = [
  "check",
  "sparkle",
  "video",
  "mic",
  "chat",
  "content",
  "fileDown",
  "flow",
  "globe",
  "box",
  "wallet",
  "calendar",
  "clock",
  "lightning",
  "users",
  "gift",
  "orbit",
  "map",
  "star",
  "reference",
  "verified",
  "refresh"
] satisfies readonly IconName[];

export type ProductIconName = (typeof productIconNames)[number];
