import type { ClientCabinetOverviewResponse } from "@elevenhouse/contracts";
import { useI18n } from "@elevenhouse/i18n";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { ClientCopy } from "../../common/i18n/clientCopy";
import {
  getClientDataConsents,
  grantClientChartAiConsent,
  revokeClientDataConsent
} from "../../features/client-profile/api/clientDataConsentApi";
import {
  createClientBirthProfile,
  getClientCabinetOverview,
  searchClientBirthPlaces,
  updateClientBirthProfile
} from "../../features/client-profile/api/clientProfileApi";
import { buildClientDataConsentCards } from "../../features/client-profile/model/clientDataConsentModel";
import {
  buildBirthProfileRequest,
  createBirthProfileForm,
  type BirthProfileFormState
} from "../../features/client-profile/model/birthProfileFormModel";
import type {
  ClientDataConsentPendingAction,
  ClientDataConsentSectionStatus
} from "./ClientDataConsentSection";
import { MePageView, type ClientCabinetSection, type ClientCabinetStatus } from "./MePageView";

const emptyForm = createBirthProfileForm(null);

export function MePage() {
  const { dictionary, locale } = useI18n<ClientCopy>();
  const [activeSection, setActiveSection] = useState<ClientCabinetSection>("home");
  const [form, setForm] = useState<BirthProfileFormState>(emptyForm);
  const [overview, setOverview] = useState<ClientCabinetOverviewResponse | null>(null);
  const [status, setStatus] = useState<ClientCabinetStatus>("loading");
  const [consentResponse, setConsentResponse] = useState<Awaited<
    ReturnType<typeof getClientDataConsents>
  > | null>(null);
  const [consentStatus, setConsentStatus] = useState<ClientDataConsentSectionStatus>("loading");
  const [pendingConsentAction, setPendingConsentAction] =
    useState<ClientDataConsentPendingAction | null>(null);
  const consentRequestVersion = useRef(0);
  const consentLocale = useRef(locale);
  consentLocale.current = locale;

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

  const loadConsents = useCallback(() => {
    const requestVersion = ++consentRequestVersion.current;
    const requestedLocale = locale;
    setConsentResponse(null);
    setConsentStatus("loading");

    void getClientDataConsents(requestedLocale)
      .then((response) => {
        if (
          consentRequestVersion.current !== requestVersion ||
          consentLocale.current !== requestedLocale
        ) {
          return;
        }
        setConsentResponse(response);
        setConsentStatus("ready");
      })
      .catch(() => {
        if (
          consentRequestVersion.current === requestVersion &&
          consentLocale.current === requestedLocale
        ) {
          setConsentStatus("error");
        }
      });
  }, [locale]);

  useEffect(() => {
    loadConsents();
    return () => {
      consentRequestVersion.current += 1;
    };
  }, [loadConsents]);

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

  async function runConsentMutation(
    action: ClientDataConsentPendingAction,
    mutate: () => Promise<unknown>
  ) {
    consentRequestVersion.current += 1;
    setPendingConsentAction(action);
    setConsentStatus("ready");

    try {
      await mutate();
      const requestedLocale = consentLocale.current;
      const requestVersion = ++consentRequestVersion.current;
      const response = await getClientDataConsents(requestedLocale);
      if (
        consentRequestVersion.current !== requestVersion ||
        consentLocale.current !== requestedLocale
      ) {
        return;
      }
      setConsentResponse(response);
      setConsentStatus("ready");
    } catch {
      consentRequestVersion.current += 1;
      setConsentResponse(null);
      setConsentStatus("error");
    } finally {
      setPendingConsentAction((current) =>
        current?.kind === action.kind && current.id === action.id ? null : current
      );
    }
  }

  async function handleGrantConsent(astrologerUserId: string) {
    const currentResponse = consentResponse;
    if (!currentResponse || currentResponse.notice.locale !== locale) {
      setConsentResponse(null);
      setConsentStatus("error");
      return;
    }

    await runConsentMutation({ kind: "grant", id: astrologerUserId }, () =>
      grantClientChartAiConsent(astrologerUserId, {
        accepted: true,
        locale,
        noticeSha256: currentResponse.noticeSha256,
        policyVersion: currentResponse.policy.policyVersion
      })
    );
  }

  async function handleRevokeConsent(consentId: string) {
    await runConsentMutation({ kind: "revoke", id: consentId }, () =>
      revokeClientDataConsent(consentId)
    );
  }

  let resolvedConsentStatus = consentStatus;
  let consentCards: ReturnType<typeof buildClientDataConsentCards> | null = null;
  if (consentStatus === "ready" && overview && consentResponse) {
    try {
      consentCards = buildClientDataConsentCards(overview, consentResponse);
    } catch {
      resolvedConsentStatus = "error";
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
      consentSection={{
        cards: consentCards,
        copy: dictionary.chartAiConsent,
        notice: consentResponse?.notice ?? null,
        noticeSha256: consentResponse?.noticeSha256 ?? null,
        pendingAction: pendingConsentAction,
        status: resolvedConsentStatus,
        onGrant: (astrologerUserId) => {
          void handleGrantConsent(astrologerUserId);
        },
        onRetry: loadConsents,
        onRevoke: (consentId) => {
          void handleRevokeConsent(consentId);
        }
      }}
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
