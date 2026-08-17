import type { ClientRelatedBirthProfileResponse } from "@elevenhouse/contracts";
import {
  formatBirthDate,
  getClientInitials,
  type ClientSelectOption
} from "../../clients/model/clientSelectorModel";

export type ChartPartnerOption =
  | {
      readonly source: "crm_client";
      readonly client: ClientSelectOption;
    }
  | {
      readonly source: "client_related_profile";
      readonly profile: ClientRelatedBirthProfileResponse;
    };

export function toCrmChartPartnerOption(client: ClientSelectOption): ChartPartnerOption {
  return { source: "crm_client", client };
}

export function toRelatedChartPartnerOption(
  profile: ClientRelatedBirthProfileResponse
): ChartPartnerOption {
  return { source: "client_related_profile", profile };
}

export function getChartPartnerBirthData(option: ChartPartnerOption | null) {
  if (!option) return null;

  return option.source === "crm_client" ? option.client.birthData : option.profile;
}

export function getChartPartnerLabel(option: ChartPartnerOption | null): string | null {
  if (!option) return null;

  return option.source === "crm_client"
    ? option.client.label
    : `${option.profile.displayName} · ${option.profile.relationshipLabel}`;
}

export function getChartPartnerInitials(option: ChartPartnerOption | null): string {
  const label = getChartPartnerLabel(option);

  return label ? getClientInitials(label) : "П";
}

export function getChartPartnerSubtitle(option: ChartPartnerOption | null): string {
  if (!option) return "";
  if (option.source === "crm_client") return option.client.subtitle;

  const birthDateDisplay = formatBirthDate(option.profile.birthDate);

  return (
    [birthDateDisplay || option.profile.birthDate, option.profile.birthPlaceText]
      .filter(Boolean)
      .join(" · ") || "Дата рождения не заполнена"
  );
}

export function getChartPartnerRelatedProfileId(option: ChartPartnerOption | null): string | null {
  return option?.source === "client_related_profile" ? option.profile.id : null;
}

export function getChartPartnerClient(
  option: ChartPartnerOption | null
): ClientSelectOption | null {
  return option?.source === "crm_client" ? option.client : null;
}
