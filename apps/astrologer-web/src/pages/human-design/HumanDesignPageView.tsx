import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { CSSProperties } from "react";
import { ClientSearchCombobox } from "../../features/clients/components/ClientSearchCombobox";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import { HumanDesignBodygraph } from "../../features/human-design/components/HumanDesignBodygraph";
import {
  getHumanDesignDetail,
  type HumanDesignDetailKey,
  type HumanDesignViewModel
} from "../../features/human-design/model/humanDesignViewModel";
import styles from "./HumanDesignPage.module.css";

export type HumanDesignPageStatus = {
  readonly tone: "empty" | "ready" | "busy" | "success" | "warning" | "error";
  readonly title: string;
  readonly detail: string;
};

export type HumanDesignPageViewProps = {
  readonly selectedClient: ClientSelectOption | null;
  readonly model: HumanDesignViewModel | null;
  readonly selectedDetailKey: HumanDesignDetailKey;
  readonly status: HumanDesignPageStatus;
  readonly errorMessage: string | null;
  readonly isBusy: boolean;
  readonly onSelectClient: (client: ClientSelectOption) => void;
  readonly onSelectDetail: (key: HumanDesignDetailKey) => void;
  readonly onPreview: () => void | Promise<void>;
};

export function HumanDesignPageView({
  selectedClient,
  model,
  selectedDetailKey,
  status,
  errorMessage,
  isBusy,
  onSelectClient,
  onSelectDetail,
  onPreview
}: HumanDesignPageViewProps) {
  const detail = model ? getHumanDesignDetail(model, selectedDetailKey) : null;

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
        </div>
        <nav className={styles.modeTabs} aria-label="Режим Human Design">
          <button className={styles.modeActive} type="button">
            Индивидуальный
          </button>
          <button
            className={styles.modeDisabled}
            type="button"
            disabled
            title="Будет подключено после транзитного backend-контура"
          >
            Транзиты
          </button>
          <button
            className={styles.modeDisabled}
            type="button"
            disabled
            title="Будет подключено после compatibility contracts"
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
          disabled={isBusy || !selectedClient}
          onClick={() => void onPreview()}
        >
          <Icon iconName="lightning" width={15} height={15} aria-hidden="true" />
          {isBusy ? "Расчёт" : "Рассчитать"}
        </button>
        <button className={styles.toolButton} type="button" disabled>
          <Icon iconName="pin" width={15} height={15} aria-hidden="true" />
          Привязать
        </button>
        <button className={styles.toolButton} type="button" disabled>
          <Icon iconName="doc" width={15} height={15} aria-hidden="true" />
          PDF
        </button>
        <button className={styles.toolButton} type="button" disabled>
          <Icon iconName="sparkle" width={15} height={15} aria-hidden="true" />
          AI-разбор
        </button>
      </header>

      <section className={styles.body}>
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
          </section>
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
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <Icon iconName="flow" width={28} height={28} aria-hidden="true" />
              <strong>Выберите клиента и рассчитайте бодиграф</strong>
              <span>Поддержан только individual preview из CRM birth data.</span>
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
