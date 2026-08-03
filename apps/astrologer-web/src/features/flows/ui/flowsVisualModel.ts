import type { FlowDefinitionSummaryV2 } from "@elevenhouse/contracts";
import {
  flowApprovalModeLabel,
  flowDefinitionStateLabel,
  flowRuntimeStatusLabel,
  type FlowDisplayLocale
} from "../model/flowDisplay";

export type FlowGalleryCardModel = {
  readonly id: string;
  readonly title: string;
  readonly definitionStateLabel: string;
  readonly runtimeStatusLabel: string;
  readonly approvalModeLabel: string;
  readonly graphSchemaLabel: string;
  readonly originLabel: string;
  readonly revisionLabel: string;
  readonly publishedVersionLabel: string;
  readonly migrationRequired: boolean;
};

export function buildFlowGalleryCard(
  flow: FlowDefinitionSummaryV2,
  locale: FlowDisplayLocale
): FlowGalleryCardModel {
  return {
    id: flow.id,
    title: flow.name,
    definitionStateLabel: flowDefinitionStateLabel(flow.state, locale),
    runtimeStatusLabel: flowRuntimeStatusLabel(flow.runtimeStatus, locale),
    approvalModeLabel: flowApprovalModeLabel(flow.approvalMode, locale),
    graphSchemaLabel:
      flow.graphSchemaVersion === "flow-graph.v2"
        ? locale === "ru"
          ? "Схема V2"
          : "V2 graph"
        : locale === "ru"
          ? "Legacy V1"
          : "Legacy V1",
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
    migrationRequired: flow.migrationRequired
  };
}

function originLabel(flow: FlowDefinitionSummaryV2, locale: FlowDisplayLocale): string {
  if (flow.graphSchemaVersion === "flow-graph.v1") {
    return locale === "ru" ? "Legacy-определение" : "Legacy definition";
  }
  if (flow.origin.type === "template") return locale === "ru" ? "Из шаблона" : "From template";
  if (flow.origin.type === "migration") return locale === "ru" ? "После миграции" : "Migrated";
  return locale === "ru" ? "С нуля" : "Blank";
}
