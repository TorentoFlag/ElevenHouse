import type { FlowDefinitionSummaryV3 } from "@elevenhouse/contracts";
import {
  flowApprovalModeLabel,
  flowAutomationStateLabel,
  flowDefinitionStateLabel,
  type FlowDisplayLocale
} from "../model/flowDisplay";

export type FlowGalleryCardModel = {
  readonly id: string;
  readonly title: string;
  readonly definitionStateLabel: string;
  readonly automationStatusLabel: string;
  readonly approvalModeLabel: string;
  readonly graphSchemaLabel: string;
  readonly originLabel: string;
  readonly revisionLabel: string;
  readonly publishedVersionLabel: string;
};

export function buildFlowGalleryCard(
  flow: FlowDefinitionSummaryV3,
  locale: FlowDisplayLocale
): FlowGalleryCardModel {
  return {
    id: flow.id,
    title: flow.name,
    definitionStateLabel: flowDefinitionStateLabel(flow.state, locale),
    automationStatusLabel: flowAutomationStateLabel(flow, locale),
    approvalModeLabel: flowApprovalModeLabel(flow.approvalMode, locale),
    graphSchemaLabel: locale === "ru" ? "Схема V2" : "V2 graph",
    originLabel: originLabel(flow, locale),
    revisionLabel: locale === "ru" ? `Редакция ${flow.revision}` : `Revision ${flow.revision}`,
    publishedVersionLabel:
      flow.latestPublishedVersion === null
        ? locale === "ru"
          ? "Не опубликована"
          : "Not published"
        : locale === "ru"
          ? `Версия ${flow.latestPublishedVersion}`
          : `Version ${flow.latestPublishedVersion}`,
  };
}

function originLabel(flow: FlowDefinitionSummaryV3, locale: FlowDisplayLocale): string {
  if (flow.origin.type === "template") return locale === "ru" ? "Из шаблона" : "From template";
  return locale === "ru" ? "С нуля" : "Blank";
}
