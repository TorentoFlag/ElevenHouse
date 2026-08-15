import type { ReactNode } from "react";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import { ClientSearchCombobox } from "../../clients/components/ClientSearchCombobox";
import type { ChartEngineCopy } from "../model/chartEngineCopy";
import type { ChartEngineMode } from "../model/chartEngineMode";
import { ChartEngineModeMenu } from "./ChartEngineModeMenu";
import styles from "./ChartEnginePage.module.css";

export function ChartEngineHeader({
  actionBar,
  activeMode,
  copy,
  isHorarySetup = false,
  isBusy,
  momentControls,
  onSelectClient,
  onSelectMode,
  onSelectPartnerClient,
  selectedClient,
  selectedPartnerClient
}: {
  readonly actionBar: ReactNode;
  readonly activeMode: ChartEngineMode;
  readonly copy: ChartEngineCopy;
  readonly isHorarySetup?: boolean;
  readonly isBusy: boolean;
  readonly momentControls?: ReactNode;
  readonly onSelectClient?: (client: ClientSelectOption) => void;
  readonly onSelectMode: (mode: ChartEngineMode) => void;
  readonly onSelectPartnerClient?: (client: ClientSelectOption) => void;
  readonly selectedClient: ClientSelectOption | null;
  readonly selectedPartnerClient: ClientSelectOption | null;
}) {
  const isPartnerMode = activeMode === "synastry" || activeMode === "composite";

  return (
    <header
      className={isHorarySetup ? `${styles.toolbar} ${styles.horaryToolbar}` : styles.toolbar}
    >
      <div className={styles.titleGroup}>
        <span className={styles.iconBox} aria-hidden="true">
          ☉
        </span>
        <div>
          <p>{copy.modes[activeMode].title}</p>
          <h1>{copy.title}</h1>
        </div>
      </div>
      <ClientStrip
        copy={copy}
        disabled={isBusy}
        onSelect={onSelectClient}
        selectedClient={selectedClient}
      />
      {isPartnerMode ? (
        <ClientStrip
          copy={copy}
          disabled={isBusy}
          isPartner
          onSelect={onSelectPartnerClient}
          selectedClient={selectedPartnerClient}
        />
      ) : null}
      <ChartEngineModeMenu activeMode={activeMode} copy={copy} onSelect={onSelectMode} />
      <div className={styles.toolbarSpacer} />
      {momentControls}
      {actionBar}
    </header>
  );
}

function ClientStrip({
  copy,
  disabled,
  isPartner = false,
  onSelect,
  selectedClient
}: {
  readonly copy: ChartEngineCopy;
  readonly disabled: boolean;
  readonly isPartner?: boolean;
  readonly onSelect?: (client: ClientSelectOption) => void;
  readonly selectedClient: ClientSelectOption | null;
}) {
  const label = isPartner ? copy.client.partnerLabel : copy.client.label;
  const placeholder = isPartner ? copy.client.choosePartner : copy.client.choose;

  return (
    <div className={styles.clientStrip}>
      {onSelect ? (
        <ClientSearchCombobox
          label={label}
          value={selectedClient?.value ?? ""}
          placeholder={placeholder}
          selectedClient={selectedClient}
          requireBirthDate={false}
          fullWidth
          disabled={disabled}
          onSelect={onSelect}
        />
      ) : (
        <div className={styles.clientButton}>
          <span>
            {selectedClient?.initials ??
              (isPartner ? copy.client.partnerFallbackInitial : copy.client.fallbackInitial)}
          </span>
          <strong>{selectedClient?.label ?? placeholder}</strong>
          <small>
            {isPartner ? `${copy.client.partnerPrefix} · ` : ""}
            {selectedClient?.birthDateDisplay ?? copy.client.crmSource}
          </small>
        </div>
      )}
    </div>
  );
}
