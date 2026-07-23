import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { CSSProperties } from "react";
import type { CalculationRecordResponse } from "@elevenhouse/contracts";
import { SavedCalculationPicker } from "../../features/calculations/components/SavedCalculationPicker";
import { ClientSearchCombobox } from "../../features/clients/components/ClientSearchCombobox";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import { HumanDesignBodygraph } from "../../features/human-design/components/HumanDesignBodygraph";
import {
  getHumanDesignDetail,
  type HumanDesignDetailKey,
  type HumanDesignTransitViewModel,
  type HumanDesignViewModel
} from "../../features/human-design/model/humanDesignViewModel";
import styles from "./HumanDesignPage.module.css";

export type HumanDesignPageStatus = {
  readonly tone: "empty" | "ready" | "busy" | "success" | "warning" | "error";
  readonly title: string;
  readonly detail: string;
};

export type HumanDesignWorkspaceMode = "individual" | "compatibility" | "transit";

export type HumanDesignPageViewProps = {
  readonly mode: HumanDesignWorkspaceMode;
  readonly selectedClient: ClientSelectOption | null;
  readonly selectedPartnerClient: ClientSelectOption | null;
  readonly model: HumanDesignViewModel | null;
  readonly transitModel: HumanDesignTransitViewModel | null;
  readonly transitInstantValue: string;
  readonly canOpenTransitMode: boolean;
  readonly selectedDetailKey: HumanDesignDetailKey;
  readonly calculations: readonly CalculationRecordResponse[];
  readonly selectedCalculationId: string | null;
  readonly status: HumanDesignPageStatus;
  readonly errorMessage: string | null;
  readonly aiDraftText: string;
  readonly aiDraftStatus: "draft" | "approved" | null;
  readonly aiDraftErrorMessage: string | null;
  readonly aiDraftDisabledReason: string | null;
  readonly aiDraftSaveDisabled: boolean;
  readonly aiDraftApproveDisabled: boolean;
  readonly pdfLabel: string;
  readonly pdfDisabled: boolean;
  readonly pdfTitle: string;
  readonly pdfErrorMessage: string | null;
  readonly isBusy: boolean;
  readonly isLinked: boolean;
  readonly onSelectMode: (mode: HumanDesignWorkspaceMode) => void;
  readonly onSelectClient: (client: ClientSelectOption) => void;
  readonly onSelectPartnerClient: (client: ClientSelectOption) => void;
  readonly onChangeTransitInstant: (value: string) => void;
  readonly onSelectDetail: (key: HumanDesignDetailKey) => void;
  readonly onChangeAiDraftText: (value: string) => void;
  readonly onSelectSaved: (calculation: CalculationRecordResponse) => void;
  readonly onFetchTransit: () => void | Promise<void>;
  readonly onCreateAiDraft: () => void | Promise<void>;
  readonly onPdf: () => void | Promise<void>;
  readonly onSaveAiDraft: () => void | Promise<void>;
  readonly onApproveAiDraft: () => void | Promise<void>;
  readonly onPreview: () => void | Promise<void>;
  readonly onPersist: () => void | Promise<void>;
  readonly onRecalculate: () => void | Promise<void>;
};

export function HumanDesignPageView({
  mode,
  selectedClient,
  selectedPartnerClient,
  model,
  transitModel,
  transitInstantValue,
  canOpenTransitMode,
  selectedDetailKey,
  calculations,
  selectedCalculationId,
  status,
  errorMessage,
  aiDraftText,
  aiDraftStatus,
  aiDraftErrorMessage,
  aiDraftDisabledReason,
  aiDraftSaveDisabled,
  aiDraftApproveDisabled,
  pdfLabel,
  pdfDisabled,
  pdfTitle,
  pdfErrorMessage,
  isBusy,
  isLinked,
  onSelectMode,
  onSelectClient,
  onSelectPartnerClient,
  onChangeTransitInstant,
  onSelectDetail,
  onChangeAiDraftText,
  onSelectSaved,
  onFetchTransit,
  onCreateAiDraft,
  onPdf,
  onSaveAiDraft,
  onApproveAiDraft,
  onPreview,
  onPersist,
  onRecalculate
}: HumanDesignPageViewProps) {
  const detail = model ? getHumanDesignDetail(model, selectedDetailKey) : null;
  const isTransitMode = mode === "transit";
  const isAiDraftDisabled = Boolean(aiDraftDisabledReason);
  const canRunPrimaryAction = isTransitMode
    ? Boolean(selectedCalculationId)
    : Boolean(selectedClient) && (mode !== "compatibility" || Boolean(selectedPartnerClient));

  return (
    <main className={styles.page}>
      <header className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <span className={styles.iconBox} aria-hidden="true">
            <Icon iconName="flow" width={18} height={18} />
          </span>
          <h1>Дизайн человека</h1>
        </div>
        <div className={styles.clientStrip}>
          <ClientSearchCombobox
            label="Клиент"
            value={selectedClient?.value ?? ""}
            placeholder="Выберите клиента"
            selectedClient={selectedClient}
            requireBirthDate={false}
            fullWidth
            disabled={isBusy}
            onSelect={onSelectClient}
          />
          {mode === "compatibility" ? (
            <ClientSearchCombobox
              label="Партнёр"
              value={selectedPartnerClient?.value ?? ""}
              placeholder="Выберите партнёра"
              selectedClient={selectedPartnerClient}
              requireBirthDate={false}
              fullWidth
              disabled={isBusy}
              onSelect={onSelectPartnerClient}
            />
          ) : null}
        </div>
        <nav className={styles.modeTabs} aria-label="Режим Human Design">
          <button
            className={mode === "individual" ? styles.modeActive : styles.modeButton}
            type="button"
            disabled={isBusy}
            onClick={() => onSelectMode("individual")}
          >
            Индивидуальный
          </button>
          <button
            className={mode === "transit" ? styles.modeActive : canOpenTransitMode ? styles.modeButton : styles.modeDisabled}
            type="button"
            disabled={isBusy || !canOpenTransitMode}
            onClick={() => onSelectMode("transit")}
          >
            Транзиты
          </button>
          <button
            className={mode === "compatibility" ? styles.modeActive : styles.modeButton}
            type="button"
            disabled={isBusy}
            onClick={() => onSelectMode("compatibility")}
          >
            Партнёрский
          </button>
        </nav>
        <div className={styles.stateSummary} data-tone={status.tone} aria-live="polite">
          <strong>{status.title}</strong>
          <span>{status.detail}</span>
        </div>
        <div className={styles.toolbarSpacer} />
        <button
          className={styles.calculateButton}
          type="button"
          disabled={isBusy || !canRunPrimaryAction}
          onClick={() => void (isTransitMode ? onFetchTransit() : onPreview())}
        >
          <Icon iconName={isTransitMode ? "orbit" : "lightning"} width={15} height={15} aria-hidden="true" />
          {isBusy ? "Расчёт" : isTransitMode ? "Показать" : "Рассчитать"}
        </button>
        <button
          className={styles.toolButton}
          type="button"
          disabled={
            isBusy ||
            isTransitMode ||
            !selectedClient ||
            (mode === "compatibility" && !selectedPartnerClient) ||
            !model ||
            isLinked
          }
          onClick={() => void onPersist()}
        >
          <Icon iconName="pin" width={15} height={15} aria-hidden="true" />
          {isLinked ? "Привязан" : "Привязать"}
        </button>
        <button
          className={styles.toolButton}
          type="button"
          disabled={isBusy || !selectedCalculationId}
          onClick={() => void (isTransitMode ? onFetchTransit() : onRecalculate())}
        >
          <Icon iconName="refresh" width={15} height={15} aria-hidden="true" />
          Обновить
        </button>
        <button
          className={styles.toolButton}
          type="button"
          disabled={pdfDisabled}
          title={pdfTitle}
          onClick={() => void onPdf()}
        >
          <Icon iconName="doc" width={15} height={15} aria-hidden="true" />
          {pdfLabel}
        </button>
        <button
          className={styles.toolButton}
          type="button"
          disabled={isAiDraftDisabled}
          title={aiDraftDisabledReason ?? undefined}
          onClick={() => void onCreateAiDraft()}
        >
          <Icon iconName="sparkle" width={15} height={15} aria-hidden="true" />
          {aiDraftText ? "Обновить AI" : "AI-разбор"}
        </button>
      </header>

      <section className={styles.body}>
        <div className={styles.savedSlot}>
          <SavedCalculationPicker
            calculations={calculations}
            selectedCalculationId={selectedCalculationId}
            onSelect={onSelectSaved}
          />
        </div>
        <aside className={styles.rail} aria-label="Свойства Human Design">
          <section className={styles.railGroup}>
            <h2>Клиент</h2>
            <p className={styles.helpText}>
              Birth data берутся из карточки клиента; браузер не принимает дату рождения или
              долготы планет.
            </p>
            {!selectedClient ? (
              <p className={styles.warningText}>Выберите клиента из CRM.</p>
            ) : !selectedClient.hasBirthDate ? (
              <p className={styles.warningText}>В карточке клиента не заполнена дата рождения.</p>
            ) : null}
            {isTransitMode && !selectedCalculationId ? (
              <p className={styles.warningText}>Откройте сохранённый individual расчёт.</p>
            ) : null}
          </section>
          {isTransitMode ? (
            <section className={styles.railGroup}>
              <h2>Транзит</h2>
              <label className={styles.transitField}>
                <span>Момент</span>
                <input
                  type="datetime-local"
                  value={transitInstantValue}
                  disabled={isBusy || !selectedCalculationId}
                  onChange={(event) => onChangeTransitInstant(event.currentTarget.value)}
                />
              </label>
              {transitModel ? (
                <div className={styles.transitMetrics}>
                  <div>
                    <span>Момент</span>
                    <strong>{transitModel.snapshotLabel}</strong>
                  </div>
                  <div>
                    <span>Дозамкнутые</span>
                    <strong>{transitModel.summary.completedChannelCount}</strong>
                  </div>
                  <div>
                    <span>Временные центры</span>
                    <strong>{transitModel.summary.temporarilyDefinedCenterCount}</strong>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
          {isTransitMode && transitModel ? (
            <section className={styles.railGroup}>
              <h2>Транзитные каналы · {transitModel.completedChannels.length}</h2>
              {transitModel.completedChannels.length ? (
                transitModel.completedChannels.map((channel) => (
                  <div className={styles.transitItem} key={channel.code}>
                    <span>{`Канал ${channel.label}`}</span>
                    <strong>{channel.name}</strong>
                    <small>{`свои ${channel.natalGate} + транзит ${channel.transitGate}`}</small>
                  </div>
                ))
              ) : (
                <p className={styles.muted}>Новых каналов нет.</p>
              )}
            </section>
          ) : null}
          {isTransitMode && transitModel ? (
            <section className={styles.railGroup}>
              <h2>Транзитные планеты</h2>
              <div className={styles.transitActivations}>
                {transitModel.transitActivations.map((activation) => (
                  <div className={styles.activation} key={`${activation.side}-${activation.body}`}>
                    <span aria-hidden="true">{activation.glyph}</span>
                    <strong>
                      {activation.gate}
                      <small>.{activation.line}</small>
                    </strong>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {model ? (
            <>
              <section className={styles.railGroup}>
                <h2>Свойства</h2>
                {model.properties.map((property) => (
                  <button
                    className={
                      selectedDetailKey === property.key ? styles.propertyActive : styles.property
                    }
                    key={`${property.key}-${property.label}`}
                    type="button"
                    onClick={() => onSelectDetail(property.key)}
                  >
                    <span>{property.label}</span>
                    <strong data-accent={property.accent ? "true" : undefined}>
                      {property.value}
                    </strong>
                  </button>
                ))}
              </section>
              {model.compatibility ? (
                <section className={styles.railGroup}>
                  <h2>Связь</h2>
                  <button
                    className={
                      selectedDetailKey === "compatibility:summary"
                        ? styles.propertyActive
                        : styles.property
                    }
                    type="button"
                    onClick={() => onSelectDetail("compatibility:summary")}
                  >
                    <span>Партнёр</span>
                    <strong>{`${model.compatibility.partner.type} · ${model.compatibility.partner.profile}`}</strong>
                  </button>
                  {model.compatibility.dynamicGroups.map((group) => (
                    <div className={styles.connectionGroup} key={group.dynamic}>
                      <div className={styles.connectionGroupHead}>
                        <span>{group.label}</span>
                        <strong>{group.count}</strong>
                      </div>
                      {group.channels.map((channel) => (
                        <button
                          className={
                            selectedDetailKey === channel.key
                              ? styles.channelActive
                              : styles.channelItem
                          }
                          key={channel.key}
                          type="button"
                          onClick={() => onSelectDetail(channel.key)}
                        >
                          <span>{`Канал ${channel.label}`}</span>
                          <strong>{channel.name}</strong>
                        </button>
                      ))}
                    </div>
                  ))}
                </section>
              ) : null}
              <section className={styles.railGroup}>
                <h2>9 центров</h2>
                {model.centers.map((center) => (
                  <button
                    className={
                      selectedDetailKey === center.code ? styles.centerActive : styles.centerItem
                    }
                    key={center.code}
                    type="button"
                    onClick={() => onSelectDetail(center.code)}
                  >
                    <span
                      className={styles.centerDot}
                      data-defined={center.defined ? "true" : "false"}
                      style={center.defined ? centerColorStyle(center.color) : undefined}
                    />
                    <span>{center.label}</span>
                    <small>{center.stateLabel}</small>
                  </button>
                ))}
              </section>
              <section className={styles.railGroup}>
                <h2>Каналы · {model.channels.length}</h2>
                {model.channels.length ? (
                  model.channels.map((channel) => (
                    <button
                      className={
                        selectedDetailKey === `ch:${channel.code}`
                          ? styles.channelActive
                          : styles.channelItem
                      }
                      key={channel.code}
                      type="button"
                      onClick={() => onSelectDetail(`ch:${channel.code}`)}
                    >
                      <span>{`Канал ${channel.label}`}</span>
                      <strong>{channel.name}</strong>
                    </button>
                  ))
                ) : (
                  <p className={styles.muted}>Нет определённых каналов.</p>
                )}
              </section>
            </>
          ) : null}
        </aside>

        <section className={styles.workspace} aria-label="Бодиграф">
          {model ? (
            <>
              <div className={styles.graphWrap}>
                <ActivationColumn title="Дизайн" tone="design" activations={model.designActivations} />
                <HumanDesignBodygraph
                  model={model}
                  transitModel={isTransitMode ? transitModel : null}
                  selectedKey={selectedDetailKey}
                  onSelect={onSelectDetail}
                />
                <ActivationColumn
                  title="Личность"
                  tone="personality"
                  activations={model.personalityActivations}
                />
              </div>
              <div className={styles.legend} aria-label="Легенда активаций">
                <span>
                  <i className={styles.personalityDot} /> Личность
                </span>
                <span>
                  <i className={styles.designDot} /> Дизайн
                </span>
                <span>
                  <i className={styles.bothDot} /> обе активации
                </span>
                {isTransitMode ? (
                  <span>
                    <i className={styles.transitDot} /> транзит
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <Icon iconName="flow" width={28} height={28} aria-hidden="true" />
              <strong>
                {mode === "transit"
                  ? "Откройте сохранённый individual расчёт"
                  : mode === "compatibility"
                  ? "Выберите двух клиентов и рассчитайте связь"
                  : "Выберите клиента и рассчитайте бодиграф"}
              </strong>
              <span>
                {mode === "transit"
                  ? "Transit overlay строится поверх сохранённого natal результата."
                  : mode === "compatibility"
                  ? "Партнёрский preview использует два CRM bodygraph результата."
                  : "Поддержан individual preview из CRM birth data."}
              </span>
            </div>
          )}
        </section>

        <aside className={styles.panel} aria-label="Деталь Human Design">
          <div className={styles.panelHead} data-tone={detail?.tone ?? "muted"}>
            <span>{detail?.subtitle ?? "Деталь"}</span>
            <strong>{detail?.title ?? "Выберите элемент"}</strong>
          </div>
          <div className={styles.panelBody}>
            <p>{detail?.text ?? "После расчёта здесь появится описание выбранного свойства."}</p>
            {model ? (
              <div className={styles.checksum}>
                <span>Checksum</span>
                <code>{model.checksumShort}</code>
              </div>
            ) : null}
            {selectedCalculationId ? (
              <div className={styles.aiPanel}>
                <div className={styles.aiPanelHead}>
                  <span>AI-разбор</span>
                  <strong>{aiDraftStatus === "approved" ? "Утверждён" : aiDraftText ? "Черновик" : "Нет черновика"}</strong>
                </div>
                <textarea
                  className={styles.aiTextArea}
                  value={aiDraftText}
                  placeholder="Сохранённый расчёт готов к AI-черновику."
                  disabled={isBusy}
                  aria-label="Текст AI-разбора Human Design"
                  onChange={(event) => onChangeAiDraftText(event.currentTarget.value)}
                />
                <div className={styles.aiActions}>
                  <button
                    className={styles.toolButton}
                    type="button"
                    disabled={aiDraftSaveDisabled}
                    onClick={() => void onSaveAiDraft()}
                  >
                    Сохранить
                  </button>
                  <button
                    className={styles.calculateButton}
                    type="button"
                    disabled={aiDraftApproveDisabled}
                    onClick={() => void onApproveAiDraft()}
                  >
                    Утвердить
                  </button>
                </div>
                {aiDraftDisabledReason ? (
                  <small>{aiDraftDisabledReason}</small>
                ) : null}
                {aiDraftErrorMessage ? <p className={styles.errorText}>{aiDraftErrorMessage}</p> : null}
              </div>
            ) : null}
            {pdfErrorMessage ? <p className={styles.errorText}>{pdfErrorMessage}</p> : null}
            {isTransitMode && transitModel ? (
              <div className={styles.transitPanel}>
                <div>
                  <span>Транзитный checksum</span>
                  <code>{transitModel.checksumShort}</code>
                </div>
                <p>
                  {`Активаций: ${transitModel.summary.transitActivationCount}. Дозамкнутых каналов: ${transitModel.summary.completedChannelCount}. Временных центров: ${transitModel.summary.temporarilyDefinedCenterCount}.`}
                </p>
              </div>
            ) : null}
            {errorMessage ? <p className={styles.errorText}>{errorMessage}</p> : null}
          </div>
        </aside>
      </section>
    </main>
  );
}

function centerColorStyle(color: string): CSSProperties {
  return { "--center-color": color } as CSSProperties;
}

function ActivationColumn({
  title,
  tone,
  activations
}: {
  readonly title: string;
  readonly tone: "personality" | "design";
  readonly activations: HumanDesignViewModel["personalityActivations"];
}) {
  return (
    <div className={styles.activationColumn} data-tone={tone}>
      <h2>{title}</h2>
      {activations.map((activation) => (
        <div className={styles.activation} key={`${activation.side}-${activation.body}`}>
          <span aria-hidden="true">{activation.glyph}</span>
          <strong>
            {activation.gate}
            <small>.{activation.line}</small>
          </strong>
        </div>
      ))}
    </div>
  );
}
