import { useI18n } from "@elevenhouse/i18n";
import type { UpsertAstrologerProfileRequest } from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useCurrentAstrologerProfileQuery } from "../../features/astrologer-profile/model/useCurrentAstrologerProfileQuery";
import { useUpsertAstrologerProfileMutation } from "../../features/astrologer-profile/model/useUpsertAstrologerProfileMutation";
import { SettingsPageView } from "./SettingsPageView";

export function SettingsPage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const profileQuery = useCurrentAstrologerProfileQuery();
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
      isLoading={profileQuery.isLoading}
      isError={profileQuery.isError || upsertProfileMutation.isError}
      isSavingProfile={upsertProfileMutation.isPending}
      saveStatus={upsertProfileMutation.isSuccess ? "saved" : null}
      onSaveProfile={handleSaveProfile}
    />
  );
}
