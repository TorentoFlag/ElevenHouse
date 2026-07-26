import type {
  ClientBirthDataUpsertRequest,
  ClientCabinetOverviewResponse
} from "@elevenhouse/contracts";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import {
  createClientBirthProfile,
  getClientCabinetOverview,
  updateClientBirthProfile
} from "../../features/client-profile/api/clientProfileApi";
import {
  MePageView,
  type BirthProfileFormState,
  type ClientCabinetSection,
  type ClientCabinetStatus
} from "./MePageView";

const emptyForm: BirthProfileFormState = {
  birthDate: "",
  birthPlaceText: "",
  birthTime: "",
  label: "Я"
};

export function MePage() {
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
        setForm(getPrimaryBirthProfileForm(nextOverview) ?? emptyForm);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");

    try {
      const primaryProfile = overview?.birthProfiles.find((profile) => profile.isPrimary) ?? null;
      const request = toBirthProfileRequest(form);
      const savedProfile = primaryProfile
        ? await updateClientBirthProfile(primaryProfile.id, request)
        : await createClientBirthProfile(request);
      const nextOverview = mergeBirthProfile(overview, savedProfile);
      setOverview(nextOverview);
      setForm(getPrimaryBirthProfileForm(nextOverview) ?? emptyForm);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <MePageView
      activeSection={activeSection}
      form={form}
      overview={overview}
      status={status}
      onFormChange={setForm}
      onRetry={() => {
        loadOverview();
      }}
      onSectionChange={setActiveSection}
      onSubmit={handleSubmit}
    />
  );
}

function getPrimaryBirthProfileForm(
  overview: ClientCabinetOverviewResponse
): BirthProfileFormState | null {
  const primaryProfile = overview.birthProfiles.find((profile) => profile.isPrimary);
  if (!primaryProfile) {
    return null;
  }

  return {
    birthDate: primaryProfile.birthDate ?? "",
    birthPlaceText: primaryProfile.birthPlaceText ?? "",
    birthTime: primaryProfile.birthTime ?? "",
    label: primaryProfile.label ?? "Я"
  };
}

function toBirthProfileRequest(form: BirthProfileFormState): ClientBirthDataUpsertRequest {
  const hasBirthTime = form.birthTime.trim().length > 0;

  return {
    birthCity: null,
    birthCountryCode: null,
    birthDate: form.birthDate || null,
    birthLatitude: null,
    birthLongitude: null,
    birthPlaceText: form.birthPlaceText || null,
    birthRegion: null,
    birthTime: hasBirthTime ? form.birthTime : null,
    birthTimeDstOccurrence: null,
    birthTimePrecision: hasBirthTime ? "exact" : "unknown",
    birthTimezone: null,
    isPrimary: true,
    label: form.label || "Я"
  };
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
