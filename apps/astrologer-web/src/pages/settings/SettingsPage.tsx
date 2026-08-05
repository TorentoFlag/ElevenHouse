import { useRef, useState } from "react";
import { useI18n } from "@elevenhouse/i18n";
import type { UpsertAstrologerProfileRequest } from "@elevenhouse/contracts";
import type { SubmitAstrologerVerificationRequest } from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useCurrentAstrologerProfileQuery } from "../../features/astrologer-profile/model/useCurrentAstrologerProfileQuery";
import { useUpsertAstrologerProfileMutation } from "../../features/astrologer-profile/model/useUpsertAstrologerProfileMutation";
import type { AstrologerTariffResponse } from "@elevenhouse/contracts";
import { createTariffSubscriptionAttemptRegistry } from "../../features/platform-tariffs/model/platformTariffsQueryOptions";
import { useAstrologerTariffCatalogQuery } from "../../features/platform-tariffs/model/useAstrologerTariffCatalogQuery";
import { useStartAstrologerTariffSubscriptionMutation } from "../../features/platform-tariffs/model/useStartAstrologerTariffSubscriptionMutation";
import { useCurrentAstrologerVerificationQuery } from "../../features/verification/model/useCurrentAstrologerVerificationQuery";
import { useSubmitAstrologerVerificationMutation } from "../../features/verification/model/useSubmitAstrologerVerificationMutation";
import type { SettingsSectionId } from "./components/SettingsNavigation";
import { SettingsPageView } from "./SettingsPageView";

export function SettingsPage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const [activeSectionId, setActiveSectionId] = useState<SettingsSectionId>("profile");
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<"month" | "year">("month");
  const [isProfileFormDirty, setProfileFormDirty] = useState(false);
  const profileQuery = useCurrentAstrologerProfileQuery();
  const tariffCatalogQuery = useAstrologerTariffCatalogQuery();
  const startTariffSubscriptionMutation = useStartAstrologerTariffSubscriptionMutation();
  const tariffSubscriptionAttempts = useRef(createTariffSubscriptionAttemptRegistry());
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
  const handleSelectTariff = (tariff: AstrologerTariffResponse, billingCycle: "month" | "year") => {
    const body = {
      tariffSeriesId: tariff.tariffSeriesId,
      version: tariff.version,
      billingCycle
    } as const;
    const idempotencyKey = tariffSubscriptionAttempts.current.acquire(body);
    startTariffSubscriptionMutation.mutate(
      { body, idempotencyKey },
      { onSuccess: () => tariffSubscriptionAttempts.current.acknowledge(body, idempotencyKey) }
    );
  };

  return (
    <SettingsPageView
      locale={locale}
      title={dictionary.settings.title}
      profile={profileQuery.data?.profile ?? null}
      profileIntegrityIssues={profileQuery.data?.integrityIssues ?? []}
      tariffCatalog={tariffCatalogQuery.data ?? null}
      tariffSelectionResult={startTariffSubscriptionMutation.data ?? null}
      verification={verificationQuery.data ?? null}
      selectedBillingCycle={selectedBillingCycle}
      activeSectionId={activeSectionId}
      isLoading={profileQuery.isLoading}
      isError={profileQuery.isError || upsertProfileMutation.isError}
      isTariffLoading={tariffCatalogQuery.isLoading}
      isTariffError={tariffCatalogQuery.isError || startTariffSubscriptionMutation.isError}
      isSelectingTariff={startTariffSubscriptionMutation.isPending}
      isVerificationLoading={verificationQuery.isLoading}
      isVerificationError={verificationQuery.isError || submitVerificationMutation.isError}
      isSavingProfile={upsertProfileMutation.isPending}
      isSubmittingVerification={submitVerificationMutation.isPending}
      saveStatus={upsertProfileMutation.isSuccess && !isProfileFormDirty ? "saved" : null}
      verificationSubmitStatus={submitVerificationMutation.isSuccess ? "submitted" : null}
      onSectionChange={setActiveSectionId}
      onBillingCycleChange={setSelectedBillingCycle}
      onSelectTariff={handleSelectTariff}
      onProfileDirtyChange={setProfileFormDirty}
      onSaveProfile={handleSaveProfile}
      onSubmitVerification={handleSubmitVerification}
    />
  );
}
