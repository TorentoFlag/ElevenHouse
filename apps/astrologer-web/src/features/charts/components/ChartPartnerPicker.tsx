import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { ClientRelatedBirthProfileResponse } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useDebounce } from "../../../common/hooks/useDebounce";
import {
  astrologerClientInfiniteQueryOptions,
  getAvailableClientSelectOptions,
  getClientSearchComboboxKeyAction,
  getSelectableClientOptions,
  toClientSelectOptions,
  type ClientSelectOption
} from "../../clients/model/clientSelectorModel";
import {
  getChartPartnerInitials,
  getChartPartnerLabel,
  getChartPartnerSubtitle,
  toCrmChartPartnerOption,
  toRelatedChartPartnerOption
} from "../model/chartPartnerOption";
import type { ChartEngineCopy } from "../model/chartEngineCopy";
import styles from "./ChartEnginePage.module.css";

export function ChartPartnerPicker({
  copy,
  disabled,
  onCreateProfile,
  onSelectClient,
  onSelectRelatedProfile,
  selectedClient,
  selectedPartnerClient,
  selectedRelatedProfile
}: {
  readonly copy: ChartEngineCopy;
  readonly disabled: boolean;
  readonly onCreateProfile?: () => void;
  readonly onSelectClient?: (client: ClientSelectOption) => void;
  readonly onSelectRelatedProfile?: (profile: ClientRelatedBirthProfileResponse) => void;
  readonly selectedClient: ClientSelectOption | null;
  readonly selectedPartnerClient: ClientSelectOption | null;
  readonly selectedRelatedProfile: ClientRelatedBirthProfileResponse | null;
}) {
  const id = useId().replace(/:/g, "");
  const [isOpen, setIsOpen] = useState(false);
  const selectedPartner = selectedRelatedProfile
    ? toRelatedChartPartnerOption(selectedRelatedProfile)
    : selectedPartnerClient
      ? toCrmChartPartnerOption(selectedPartnerClient)
      : null;
  const label = getChartPartnerLabel(selectedPartner);
  const subtitle = getChartPartnerSubtitle(selectedPartner);

  return (
    <div className={styles.partnerPicker}>
      <span className={styles.partnerPickerLabel}>{copy.client.partnerLabel}</span>
      <button
        type="button"
        role="combobox"
        className={styles.partnerPickerTrigger}
        aria-label={copy.client.partnerLabel}
        aria-controls={`chart-partner-picker-${id}`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        <span className={styles.partnerPickerAvatar}>
          {selectedPartner ? getChartPartnerInitials(selectedPartner) : copy.client.partnerFallbackInitial}
        </span>
        <span className={styles.partnerPickerText}>
          <strong>{label ?? copy.client.choosePartner}</strong>
          <small>{subtitle || copy.client.crmSource}</small>
        </span>
        <span className={styles.partnerPickerChevron} data-open={isOpen ? "true" : undefined}>
          <Icon iconName="chevronDown" width={15} height={15} />
        </span>
      </button>
      {isOpen ? (
        <>
          <button
            type="button"
            className={styles.partnerPickerScrim}
            aria-label={copy.birthData.close}
            onClick={() => setIsOpen(false)}
          />
          <PartnerPickerPopup
            id={`chart-partner-picker-${id}`}
            copy={copy}
            selectedClient={selectedClient}
            selectedPartnerClient={selectedPartnerClient}
            selectedRelatedProfile={selectedRelatedProfile}
            onClose={() => setIsOpen(false)}
            onCreateProfile={onCreateProfile}
            onSelectClient={onSelectClient}
            onSelectRelatedProfile={onSelectRelatedProfile}
          />
        </>
      ) : null}
    </div>
  );
}

function PartnerPickerPopup({
  copy,
  id,
  onClose,
  onCreateProfile,
  onSelectClient,
  onSelectRelatedProfile,
  selectedClient,
  selectedPartnerClient,
  selectedRelatedProfile
}: {
  readonly copy: ChartEngineCopy;
  readonly id: string;
  readonly onClose: () => void;
  readonly onCreateProfile?: () => void;
  readonly onSelectClient?: (client: ClientSelectOption) => void;
  readonly onSelectRelatedProfile?: (profile: ClientRelatedBirthProfileResponse) => void;
  readonly selectedClient: ClientSelectOption | null;
  readonly selectedPartnerClient: ClientSelectOption | null;
  readonly selectedRelatedProfile: ClientRelatedBirthProfileResponse | null;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const debouncedQuery = useDebounce(searchQuery, 300);
  const loadMoreNodeRef = useRef<HTMLDivElement | null>(null);
  const relatedProfiles = selectedClient?.relatedBirthProfiles ?? [];
  const query = useInfiniteQuery({
    ...astrologerClientInfiniteQueryOptions({ query: debouncedQuery, limit: 30 }),
    enabled: Boolean(onSelectClient)
  });
  const clients = useMemo(
    () =>
      getAvailableClientSelectOptions({
        options: toClientSelectOptions(query.data?.pages.flatMap((page) => page.clients) ?? []),
        excludeClientIds: [],
        currentValue: selectedPartnerClient?.value ?? ""
      }),
    [query.data?.pages, selectedPartnerClient?.value]
  );

  useEffect(() => {
    setActiveClientId(
      (current) =>
        current ??
        selectedPartnerClient?.value ??
        getSelectableClientOptions(clients, false)[0]?.value ??
        null
    );
  }, [clients, selectedPartnerClient?.value]);

  useEffect(() => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    const node = loadMoreNodeRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void query.fetchNextPage();
      }
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, [query]);

  const canCreateProfile = Boolean(selectedClient && onCreateProfile);

  return (
    <div className={styles.partnerPickerPopup}>
      <div className={styles.partnerPickerSection}>
        <div className={styles.partnerPickerSectionTitle}>{copy.client.relatedProfilesLabel}</div>
        <div
          className={styles.partnerPickerRelatedList}
          role="listbox"
          aria-label={copy.client.relatedProfilesLabel}
        >
          {!selectedClient ? (
            <div className={styles.partnerPickerStatus}>{copy.client.chooseClientFirst}</div>
          ) : relatedProfiles.length === 0 ? (
            <div className={styles.partnerPickerStatus}>{copy.client.noRelatedProfiles}</div>
          ) : (
            relatedProfiles.map((profile) => (
              <button
                type="button"
                role="option"
                aria-selected={selectedRelatedProfile?.id === profile.id}
                className={styles.partnerPickerOption}
                data-selected={selectedRelatedProfile?.id === profile.id ? "true" : undefined}
                disabled={!onSelectRelatedProfile}
                key={profile.id}
                onClick={() => {
                  onSelectRelatedProfile?.(profile);
                  onClose();
                }}
              >
                <span className={styles.partnerPickerOptionAvatar}>
                  {getChartPartnerInitials(toRelatedChartPartnerOption(profile))}
                </span>
                <span className={styles.partnerPickerOptionText}>
                  <strong>{profile.displayName}</strong>
                  <small>
                    {profile.relationshipLabel} · {getChartPartnerSubtitle(toRelatedChartPartnerOption(profile))}
                  </small>
                </span>
                {selectedRelatedProfile?.id === profile.id ? (
                  <span className={styles.partnerPickerCheck}>✓</span>
                ) : null}
              </button>
            ))
          )}
        </div>
        <button
          type="button"
          className={styles.partnerPickerCreate}
          disabled={!canCreateProfile}
          onClick={() => {
            onCreateProfile?.();
            onClose();
          }}
        >
          <span aria-hidden="true">+</span>
          {copy.client.createRelatedProfile}
        </button>
      </div>

      <div className={styles.partnerPickerSection}>
        <div className={styles.partnerPickerSectionTitle}>{copy.client.crmPartnersLabel}</div>
        <div className={styles.partnerPickerSearchShell}>
          <span className={styles.partnerPickerSearchIcon} aria-hidden="true">
            <Icon iconName="search" width={14} height={14} />
          </span>
          <input
            autoFocus
            aria-controls={id}
            aria-expanded="true"
            className={styles.partnerPickerSearchInput}
            placeholder={copy.client.partnerSearchPlaceholder}
            role="combobox"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              const action = getClientSearchComboboxKeyAction({
                key: event.key,
                clients,
                activeClientId,
                hasNextPage: Boolean(query.hasNextPage),
                requireBirthDate: false
              });
              if (action.kind === "ignore") return;

              event.preventDefault();
              if (action.kind === "close") {
                onClose();
              } else if (action.kind === "activate") {
                setActiveClientId(action.clientId);
              } else if (action.kind === "select") {
                onSelectClient?.(action.client);
                onClose();
              } else if (action.kind === "load-more") {
                void query.fetchNextPage();
              }
            }}
          />
        </div>
        <div className={styles.partnerPickerList} id={id} role="listbox" aria-label={copy.client.partnerLabel}>
          {query.isLoading ? (
            <div className={styles.partnerPickerStatus}>{copy.client.loadingPartners}</div>
          ) : null}
          {!query.isLoading && clients.length === 0 ? (
            <div className={styles.partnerPickerStatus}>
              {searchQuery.trim() ? copy.client.noPartnerSearchResults : copy.client.noCrmPartners}
            </div>
          ) : null}
          {clients.map((client) => {
            const isSelected = selectedPartnerClient?.value === client.value;
            const isActive = activeClientId === client.value;

            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                className={styles.partnerPickerOption}
                data-active={isActive ? "true" : undefined}
                data-selected={isSelected ? "true" : undefined}
                key={client.value}
                onMouseEnter={() => setActiveClientId(client.value)}
                onClick={() => {
                  onSelectClient?.(client);
                  onClose();
                }}
              >
                <span className={styles.partnerPickerOptionAvatar}>{client.initials}</span>
                <span className={styles.partnerPickerOptionText}>
                  <strong>{client.label}</strong>
                  <small>{client.subtitle}</small>
                </span>
                {isSelected ? <span className={styles.partnerPickerCheck}>✓</span> : null}
              </button>
            );
          })}
          {query.error ? (
            <div className={styles.partnerPickerStatus}>{copy.client.partnerLoadError}</div>
          ) : null}
          <div className={styles.partnerPickerLoadMore} ref={loadMoreNodeRef}>
            {query.isFetchingNextPage ? copy.client.loadingMorePartners : null}
            {query.isFetching && !query.isFetchingNextPage ? copy.client.refreshingPartnerSearch : null}
          </div>
        </div>
      </div>
    </div>
  );
}
