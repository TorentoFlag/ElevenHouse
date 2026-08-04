import type { ClientCabinetOverviewResponse } from "@elevenhouse/contracts";
import { useI18n } from "@elevenhouse/i18n";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { ClientCopy } from "../../common/i18n/clientCopy";
import {
  createClientBirthProfile,
  getClientCabinetOverview,
  searchClientBirthPlaces,
  updateClientBirthProfile
} from "../../features/client-profile/api/clientProfileApi";
import {
  buildBirthProfileRequest,
  createBirthProfileForm,
  type BirthProfileFormState
} from "../../features/client-profile/model/birthProfileFormModel";
import { MePageView, type ClientCabinetSection, type ClientCabinetStatus } from "./MePageView";

const emptyForm = createBirthProfileForm(null);

export function MePage() {
  const { dictionary } = useI18n<ClientCopy>();
  const [activeSection, setActiveSection] = useState<ClientCabinetSection>("home");
  const [form, setForm] = useState<BirthProfileFormState>(emptyForm);
  const [overview, setOverview] = useState<ClientCabinetOverviewResponse | null>(null);
  const [status, setStatus] = useState<ClientCabinetStatus>("loading");

  useDocumentTitle("Кабинет клиента");

  const loadOverview = useCallback(() => {
    let isCancelled = false;

    setStatus("loading");

    void getClientCabinetOverview()
      .then((nextOverview) => {
        if (isCancelled) return;
        setOverview(nextOverview);
        const primaryProfile = nextOverview.birthProfiles.find((profile) => profile.isPrimary);
        setForm(createBirthProfileForm(primaryProfile ?? null));
        setStatus("ready");
      })
      .catch(() => {
        if (!isCancelled) {
          setStatus("error");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => loadOverview(), [loadOverview]);

  const searchBirthPlaces = useCallback(async (query: string, signal: AbortSignal) => {
    const response = await searchClientBirthPlaces({ limit: 5, query }, signal);
    return response.candidates;
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestResult = buildBirthProfileRequest(form);
    if (!requestResult.ok) {
      setStatus("validation-error");
      return;
    }

    setStatus("saving");

    try {
      const primaryProfile = overview?.birthProfiles.find((profile) => profile.isPrimary) ?? null;
      const savedProfile = primaryProfile
        ? await updateClientBirthProfile(primaryProfile.id, requestResult.request)
        : await createClientBirthProfile(requestResult.request);
      const nextOverview = mergeBirthProfile(overview, savedProfile);
      setOverview(nextOverview);
      setForm(createBirthProfileForm(savedProfile));
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <MePageView
      activeSection={activeSection}
      birthPlaceSearch={{
        copy: dictionary.birthPlaceSearch,
        onSearch: searchBirthPlaces
      }}
      birthTimeOccurrenceCopy={dictionary.birthTimeOccurrence}
      form={form}
      overview={overview}
      status={status}
      onFormChange={(nextForm) => {
        setForm(nextForm);
        setStatus((currentStatus) =>
          currentStatus === "saving" || currentStatus === "loading" ? currentStatus : "ready"
        );
      }}
      onRetry={() => {
        loadOverview();
      }}
      onSectionChange={setActiveSection}
      onSubmit={handleSubmit}
    />
  );
}

function mergeBirthProfile(
  overview: ClientCabinetOverviewResponse | null,
  savedProfile: ClientCabinetOverviewResponse["birthProfiles"][number]
): ClientCabinetOverviewResponse {
  const currentOverview = overview ?? {
    astrologers: [],
    birthProfiles: [],
    summary: {
      activeSubscriptionCount: 0,
      availableMaterialCount: 0,
      directLinkOnly: true,
      unreadNotificationCount: 0,
      upcomingBookingCount: 0
    }
  };
  const birthProfiles = currentOverview.birthProfiles
    .filter((profile) => profile.id !== savedProfile.id)
    .map((profile) => (savedProfile.isPrimary ? { ...profile, isPrimary: false } : profile));

  return {
    ...currentOverview,
    birthProfiles: [savedProfile, ...birthProfiles]
  };
}
