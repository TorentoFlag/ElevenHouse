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
  { value: "audio", iconName: "content" },
  { value: "chat", iconName: "chat" },
  { value: "text", iconName: "content" },
  { value: "file", iconName: "box" },
  { value: "channel", iconName: "flow" }
] satisfies readonly ProductConstructorOption<ProductDeliveryFormat>[];

export const productExecutionModeOptions = [
  { value: "live", iconName: "video" },
  { value: "async", iconName: "refresh" },
  { value: "instant", iconName: "sparkle" }
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
  { value: "group", iconName: "chat" },
  { value: "gift", iconName: "sparkle" }
] satisfies readonly ProductConstructorOption<ProductParticipantMode>[];

export const productRequiredClientDataOptions = [
  { value: "chart1", iconName: "orbit" },
  { value: "cities", iconName: "reference" },
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
  "chat",
  "content",
  "box",
  "wallet",
  "orbit",
  "reference",
  "verified",
  "refresh"
] satisfies readonly IconName[];
