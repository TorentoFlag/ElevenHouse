import type { ClientCabinetOverviewResponse } from "@elevenhouse/contracts";
import { useI18n } from "@elevenhouse/i18n";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { ClientCopy } from "../../common/i18n/clientCopy";
import {
  createClientRelatedBirthProfile,
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
import { sessionApi } from "../../features/sessions/api/sessionApi";
import type { SessionSummary } from "@elevenhouse/contracts";

const emptyForm = createBirthProfileForm(null);
const emptyRelatedProfileForm = {
  displayName: "",
  relationshipLabel: "",
  birth: createBirthProfileForm(null)
};

export type RelatedBirthProfileFormState = typeof emptyRelatedProfileForm;

export function MePage() {
  const { dictionary, locale } = useI18n<ClientCopy>();
  const [activeSection, setActiveSection] = useState<ClientCabinetSection>("home");
  const [form, setForm] = useState<BirthProfileFormState>(emptyForm);
  const [relatedProfileForm, setRelatedProfileForm] =
    useState<RelatedBirthProfileFormState>(emptyRelatedProfileForm);
  const [overview, setOverview] = useState<ClientCabinetOverviewResponse | null>(null);
  const [status, setStatus] = useState<ClientCabinetStatus>("loading");
  const [sessions, setSessions] = useState<readonly SessionSummary[]>([]);
  const [sessionsStatus, setSessionsStatus] = useState<"loading" | "ready" | "error">("loading");

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

  const loadSessions = useCallback(() => {
    const now = new Date();
    const rangeStartAt = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const rangeEndAt = new Date(now.getTime() + 180 * 86_400_000).toISOString();
    setSessionsStatus("loading");
    void sessionApi
      .list({ rangeStartAt, rangeEndAt })
      .then((response) => {
        setSessions(response.sessions);
        setSessionsStatus("ready");
      })
      .catch(() => setSessionsStatus("error"));
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

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

  async function handleRelatedProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestResult = buildBirthProfileRequest(relatedProfileForm.birth, null);
    if (
      !requestResult.ok ||
      relatedProfileForm.displayName.trim().length === 0 ||
      relatedProfileForm.relationshipLabel.trim().length === 0
    ) {
      setStatus("validation-error");
      return;
    }

    setStatus("saving");

    try {
      const savedProfile = await createClientRelatedBirthProfile({
        ...requestResult.request,
        label: null,
        displayName: relatedProfileForm.displayName,
        relationshipLabel: relatedProfileForm.relationshipLabel
      });
      setOverview(mergeRelatedBirthProfile(overview, savedProfile));
      setRelatedProfileForm(emptyRelatedProfileForm);
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
      relatedProfileForm={relatedProfileForm}
      status={status}
      sessions={sessions}
      sessionsStatus={sessionsStatus}
      onFormChange={(nextForm) => {
        setForm(nextForm);
        setStatus((currentStatus) =>
          currentStatus === "saving" || currentStatus === "loading" ? currentStatus : "ready"
        );
      }}
      onRelatedProfileFormChange={(nextForm) => {
        setRelatedProfileForm(nextForm);
        setStatus((currentStatus) =>
          currentStatus === "saving" || currentStatus === "loading" ? currentStatus : "ready"
        );
      }}
      onRelatedProfileSubmit={handleRelatedProfileSubmit}
      onRetry={() => {
        loadOverview();
      }}
      onRetrySessions={loadSessions}
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
    relatedBirthProfiles: [],
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

function mergeRelatedBirthProfile(
  overview: ClientCabinetOverviewResponse | null,
  savedProfile: NonNullable<ClientCabinetOverviewResponse["relatedBirthProfiles"]>[number]
): ClientCabinetOverviewResponse {
  const currentOverview = overview ?? {
    astrologers: [],
    birthData: null,
    relatedBirthProfiles: [],
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
    relatedBirthProfiles: [
      ...(currentOverview.relatedBirthProfiles ?? []).filter(
        (profile) => profile.id !== savedProfile.id
      ),
      savedProfile
    ]
  };
}
