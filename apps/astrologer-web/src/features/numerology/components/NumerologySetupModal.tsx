import {
  findClientSelectOption,
  type ClientSelectOption
} from "../../clients/model/clientSelectorModel";
import type { NumerologyFormState } from "../model/numerologyFormModel";
import {
  createParticipantFormState,
  getNumerologyFormErrors,
  toClientParticipantFormState
} from "../model/numerologyFormModel";
import styles from "./NumerologyComponents.module.css";

export type NumerologySetupModalProps = {
  readonly state: NumerologyFormState;
  readonly clientOptions: readonly ClientSelectOption[];
  readonly isSubmitting: boolean;
  readonly onChange: (state: NumerologyFormState) => void;
  readonly onClose: () => void;
  readonly onSubmit: () => void;
};

export function NumerologySetupModal({
  state,
  clientOptions,
  isSubmitting,
  onChange,
  onClose,
  onSubmit
}: NumerologySetupModalProps) {
  const errors = getNumerologyFormErrors(state);

  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section className={styles.modal} aria-labelledby="numerology-setup-title">
        <header className={styles.modalHeader}>
          <h2 className={styles.modalTitle} id="numerology-setup-title">
            Новый расчет
          </h2>
          <button type="button" className="eh-button eh-button--ghost" onClick={onClose}>
            Закрыть
          </button>
        </header>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            Название
            <input
              className={styles.input}
              value={state.title}
              onChange={(event) => onChange({ ...state, title: event.target.value })}
              placeholder="Мария, психоматрица"
            />
          </label>
          <label className={styles.field}>
            Режим
            <select
              className={styles.select}
              value={state.mode}
              onChange={(event) =>
                onChange({ ...state, mode: event.target.value as NumerologyFormState["mode"] })
              }
            >
              <option value="individual">Индивидуальный</option>
              <option value="compatibility">Совместимость</option>
            </select>
          </label>
          <ParticipantFields
            label="Клиент"
            state={state}
            clientOptions={clientOptions}
            participantKey="subject"
            onChange={onChange}
          />
          {state.mode === "compatibility" ? (
            <ParticipantFields
              label="Партнер"
              state={state}
              clientOptions={clientOptions}
              participantKey="partner"
              onChange={onChange}
            />
          ) : null}
          <div className={styles.fieldGrid}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={state.includeNameNumbers}
                onChange={(event) =>
                  onChange({ ...state, includeNameNumbers: event.target.checked })
                }
              />
              Числа имени
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={state.includePsychomatrix}
                onChange={(event) =>
                  onChange({ ...state, includePsychomatrix: event.target.checked })
                }
              />
              Квадрат Пифагора
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={state.includeStrengthLines}
                onChange={(event) =>
                  onChange({ ...state, includeStrengthLines: event.target.checked })
                }
              />
              Линии силы
            </label>
            <label className={styles.field}>
              Дата прогноза
              <input
                className={styles.input}
                type="date"
                value={state.forecastDate}
                onChange={(event) => onChange({ ...state, forecastDate: event.target.value })}
              />
            </label>
          </div>
          {errors.length > 0 ? (
            <ul className={styles.errorList} aria-label="Ошибки формы">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <footer className={styles.modalFooter}>
          <span className={styles.muted}>Метод: Пифагор · v1</span>
          <button
            type="button"
            className="eh-button eh-button--primary"
            disabled={errors.length > 0 || isSubmitting}
            onClick={onSubmit}
          >
            {isSubmitting ? "Считаем..." : "Рассчитать"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ParticipantFields({
  label,
  state,
  clientOptions,
  participantKey,
  onChange
}: {
  readonly label: string;
  readonly state: NumerologyFormState;
  readonly clientOptions: readonly ClientSelectOption[];
  readonly participantKey: "subject" | "partner";
  readonly onChange: (state: NumerologyFormState) => void;
}) {
  const participant = state[participantKey];
  const selectedClient = findClientSelectOption(clientOptions, participant.clientId);
  const update = (patch: Partial<typeof participant>) =>
    onChange({ ...state, [participantKey]: { ...participant, ...patch } });

  return (
    <fieldset className={styles.fieldGrid}>
      <legend className={styles.muted}>{label}</legend>
      <label className={styles.field}>
        Источник
        <select
          className={styles.select}
          value={participant.source}
          onChange={(event) => {
            const source = event.target.value as typeof participant.source;
            onChange({ ...state, [participantKey]: createParticipantFormState(source) });
          }}
        >
          <option value="manual">Вручную</option>
          <option value="crm_client">Клиент платформы</option>
        </select>
      </label>
      {participant.source === "crm_client" ? (
        <label className={styles.field}>
          {label}
          <select
            className={styles.select}
            aria-label={label}
            value={participant.clientId}
            onChange={(event) => {
              const option = findClientSelectOption(clientOptions, event.target.value);
              if (!option) {
                update(createEmptyClientPatch());
                return;
              }
              onChange({
                ...state,
                [participantKey]: toClientParticipantFormState(option, participant)
              });
            }}
          >
            <option value="">Выберите клиента</option>
            {clientOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={!option.hasBirthDate}>
                {option.label} · {option.subtitle}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {participant.source === "crm_client" ? (
        <div className={styles.clientSummary}>
          <span>{selectedClient?.label ?? "Клиент не выбран"}</span>
          <strong>
            {selectedClient
              ? participant.birthDate || "Дата рождения не заполнена"
              : "Выберите клиента"}
          </strong>
          <small>
            {participant.birthPlaceText || selectedClient?.subtitle || "Профиль клиента"}
          </small>
        </div>
      ) : (
        <>
          <label className={styles.field}>
            Имя на экране
            <input
              className={styles.input}
              value={participant.displayName}
              onChange={(event) => update({ displayName: event.target.value })}
              placeholder="Мария"
            />
          </label>
          <label className={styles.field}>
            Полное имя
            <input
              className={styles.input}
              value={participant.fullName}
              onChange={(event) => update({ fullName: event.target.value })}
              placeholder="Мария Иванова"
            />
          </label>
          <label className={styles.field}>
            Дата рождения
            <input
              className={styles.input}
              type="date"
              value={participant.birthDate}
              onChange={(event) => update({ birthDate: event.target.value })}
            />
          </label>
        </>
      )}
    </fieldset>
  );
}

function createEmptyClientPatch(): Partial<NumerologyFormState["subject"]> {
  return {
    clientId: "",
    displayName: "",
    fullName: "",
    birthDate: "",
    birthTime: "",
    birthTimePrecision: "unknown",
    birthPlaceText: "",
    birthCountryCode: "",
    birthCity: "",
    birthRegion: "",
    birthTimezone: "",
    birthLatitude: null,
    birthLongitude: null
  };
}
