import { useState } from "react";
import { useI18n } from "@elevenhouse/i18n";
import type { UpsertAstrologerProfileRequest } from "@elevenhouse/contracts";
import type { SubmitAstrologerVerificationRequest } from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useCurrentAstrologerProfileQuery } from "../../features/astrologer-profile/model/useCurrentAstrologerProfileQuery";
import { useUpsertAstrologerProfileMutation } from "../../features/astrologer-profile/model/useUpsertAstrologerProfileMutation";
import { useCurrentBillingOverviewQuery } from "../../features/platform-billing/model/useCurrentBillingOverviewQuery";
import { useCurrentAstrologerVerificationQuery } from "../../features/verification/model/useCurrentAstrologerVerificationQuery";
import { useSubmitAstrologerVerificationMutation } from "../../features/verification/model/useSubmitAstrologerVerificationMutation";
import type { SettingsSectionId } from "./components/SettingsNavigation";
import { SettingsPageView } from "./SettingsPageView";

export function SettingsPage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const [activeSectionId, setActiveSectionId] = useState<SettingsSectionId>("profile");
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<"month" | "year" | null>(null);
  const [isProfileFormDirty, setProfileFormDirty] = useState(false);
  const profileQuery = useCurrentAstrologerProfileQuery();
  const billingQuery = useCurrentBillingOverviewQuery();
  const verificationQuery = useCurrentAstrologerVerificationQuery();
  const upsertProfileMutation = useUpsertAstrologerProfileMutation();
  const submitVerificationMutation = useSubmitAstrologerVerificationMutation();

  useDocumentTitle(dictionary.settings.documentTitle);

  const handleSaveProfile = (body: UpsertAstrologerProfileRequest) => {
    upsertProfileMutation.mutate(body);
  };
  const handleSubmitVerification = (body: SubmitAstrologerVerificationRequest) => {
    submitVerificationMutation.mutate(body);
  };

  return (
    <SettingsPageView
      locale={locale}
      title={dictionary.settings.title}
      profile={profileQuery.data?.profile ?? null}
      profileIntegrityIssues={profileQuery.data?.integrityIssues ?? []}
      billingOverview={billingQuery.data ?? null}
      verification={verificationQuery.data ?? null}
      selectedBillingCycle={selectedBillingCycle}
      activeSectionId={activeSectionId}
      isLoading={profileQuery.isLoading}
      isError={profileQuery.isError || upsertProfileMutation.isError}
      isBillingLoading={billingQuery.isLoading}
      isBillingError={billingQuery.isError}
      isVerificationLoading={verificationQuery.isLoading}
      isVerificationError={verificationQuery.isError || submitVerificationMutation.isError}
      isSavingProfile={upsertProfileMutation.isPending}
      isSubmittingVerification={submitVerificationMutation.isPending}
      saveStatus={upsertProfileMutation.isSuccess && !isProfileFormDirty ? "saved" : null}
      verificationSubmitStatus={submitVerificationMutation.isSuccess ? "submitted" : null}
      onSectionChange={setActiveSectionId}
      onBillingCycleChange={setSelectedBillingCycle}
      onProfileDirtyChange={setProfileFormDirty}
      onSaveProfile={handleSaveProfile}
      onSubmitVerification={handleSubmitVerification}
    />
  );
}
