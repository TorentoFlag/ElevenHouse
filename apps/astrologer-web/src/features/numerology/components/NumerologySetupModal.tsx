import type { NumerologyFormState } from "../model/numerologyFormModel";
import { getNumerologyFormErrors } from "../model/numerologyFormModel";
import { NumerologyParticipantFields } from "./NumerologyParticipantFields";
import styles from "./NumerologyComponents.module.css";

export type NumerologySetupModalProps = {
  readonly state: NumerologyFormState;
  readonly isSubmitting: boolean;
  readonly onChange: (state: NumerologyFormState) => void;
  readonly onClose: () => void;
  readonly onSubmit: () => void;
};

export function NumerologySetupModal({
  state,
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
          <NumerologyParticipantFields
            label="Клиент"
            state={state}
            participantKey="subject"
            onChange={onChange}
          />
          {state.mode === "compatibility" ? (
            <NumerologyParticipantFields
              label="Партнер"
              state={state}
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
