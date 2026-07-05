import { useState } from "react";
import { useI18n } from "@elevenhouse/i18n";
import type { UpsertAstrologerProfileRequest } from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useCurrentAstrologerProfileQuery } from "../../features/astrologer-profile/model/useCurrentAstrologerProfileQuery";
import { useUpsertAstrologerProfileMutation } from "../../features/astrologer-profile/model/useUpsertAstrologerProfileMutation";
import { useCurrentBillingOverviewQuery } from "../../features/platform-billing/model/useCurrentBillingOverviewQuery";
import type { SettingsSectionId } from "./components/SettingsNavigation";
import { SettingsPageView } from "./SettingsPageView";

export function SettingsPage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const [activeSectionId, setActiveSectionId] = useState<SettingsSectionId>("profile");
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<"month" | "year" | null>(null);
  const profileQuery = useCurrentAstrologerProfileQuery();
  const billingQuery = useCurrentBillingOverviewQuery();
  const upsertProfileMutation = useUpsertAstrologerProfileMutation();

  useDocumentTitle(dictionary.settings.documentTitle);

  const handleSaveProfile = (body: UpsertAstrologerProfileRequest) => {
    upsertProfileMutation.mutate(body);
  };

  return (
    <SettingsPageView
      locale={locale}
      title={dictionary.settings.title}
      profile={profileQuery.data?.profile ?? null}
      billingOverview={billingQuery.data ?? null}
      selectedBillingCycle={selectedBillingCycle}
      activeSectionId={activeSectionId}
      isLoading={profileQuery.isLoading}
      isError={profileQuery.isError || upsertProfileMutation.isError}
      isBillingLoading={billingQuery.isLoading}
      isBillingError={billingQuery.isError}
      isSavingProfile={upsertProfileMutation.isPending}
      saveStatus={upsertProfileMutation.isSuccess ? "saved" : null}
      onSectionChange={setActiveSectionId}
      onBillingCycleChange={setSelectedBillingCycle}
      onSaveProfile={handleSaveProfile}
    />
  );
}
