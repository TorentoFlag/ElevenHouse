import type { ClientCabinetOverviewResponse } from "@elevenhouse/contracts";
import { useI18n } from "@elevenhouse/i18n";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { ClientCopy } from "../../common/i18n/clientCopy";
import {
  getClientCabinetOverview,
  searchClientBirthPlaces,
  upsertClientBirthData
} from "../../features/client-profile/api/clientProfileApi";
import {
  buildBirthProfileRequest,
  createBirthProfileForm,
  type BirthProfileFormState
} from "../../features/client-profile/model/birthProfileFormModel";
import { MePageView, type ClientCabinetSection, type ClientCabinetStatus } from "./MePageView";

const emptyForm = createBirthProfileForm(null);

export function MePage() {
  const { dictionary, locale } = useI18n<ClientCopy>();
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
        setForm(createBirthProfileForm(nextOverview.birthData));
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
    const requestResult = buildBirthProfileRequest(form, overview?.birthData?.revision ?? null);
    if (!requestResult.ok) {
      setStatus("validation-error");
      return;
    }

    setStatus("saving");

    try {
      const savedProfile = await upsertClientBirthData(requestResult.request);
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
      clientLocale={locale}
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
      purchaseFlowCopy={dictionary.purchaseFlow}
    />
  );
}

function mergeBirthProfile(
  overview: ClientCabinetOverviewResponse | null,
  savedProfile: NonNullable<ClientCabinetOverviewResponse["birthData"]>
): ClientCabinetOverviewResponse {
  const currentOverview = overview ?? {
    astrologers: [],
    birthData: null,
    summary: {
      activeSubscriptionCount: 0,
      availableMaterialCount: 0,
      directLinkOnly: true,
      unreadNotificationCount: 0,
      upcomingBookingCount: 0
    }
  };
  return {
    ...currentOverview,
    birthData: savedProfile
  };
}
