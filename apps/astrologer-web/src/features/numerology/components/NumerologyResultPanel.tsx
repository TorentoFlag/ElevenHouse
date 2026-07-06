import type {
  NumerologyWorkspaceDetail,
  NumerologyWorkspaceModel
} from "../model/numerologyWorkspaceModel";
import { PythagoreanMatrix } from "./PythagoreanMatrix";
import styles from "./NumerologyComponents.module.css";

export function NumerologyResultPanel({
  model,
  detail,
  selectedSelector,
  isYearMode,
  interpretationText,
  isBusy,
  onInterpretationChange,
  onSaveInterpretation,
  onApproveInterpretation,
  onSelect
}: {
  readonly model: NumerologyWorkspaceModel | null;
  readonly detail: NumerologyWorkspaceDetail | null;
  readonly selectedSelector: string | null;
  readonly isYearMode: boolean;
  readonly interpretationText: string;
  readonly isBusy: boolean;
  readonly onInterpretationChange: (value: string) => void;
  readonly onSaveInterpretation: () => void;
  readonly onApproveInterpretation: () => void;
  readonly onSelect: (selector: string) => void;
}) {
  if (!model) {
    return (
      <div className={styles.emptyWorkspace}>
        <h2 className={styles.panelTitle}>Выберите клиента для нумерологии</h2>
        <p className={styles.muted}>
          Создайте первый расчет или откройте историю, чтобы увидеть портрет клиента.
        </p>
      </div>
    );
  }

  if (model.mode === "compatibility" && model.compatibility) {
    return (
      <CompatibilityWorkspace
        model={model}
        interpretationText={interpretationText}
        isBusy={isBusy}
        onInterpretationChange={onInterpretationChange}
        onSaveInterpretation={onSaveInterpretation}
        onApproveInterpretation={onApproveInterpretation}
      />
    );
  }

  return (
    <>
      <aside className={styles.keyRail} aria-label="Ключевые числа">
        <span className={styles.kicker}>Ключевые числа</span>
        {model.keyNumbers.map((item) => (
          <button
            className={styles.keyNumber}
            data-selected={selectedSelector === item.selector ? "true" : undefined}
            key={item.code}
            onClick={() => onSelect(item.selector)}
            type="button"
          >
            <span className={styles.keyValue}>{item.value}</span>
            <span className={styles.keyCopy}>
              <span>{item.label}</span>
              <small>{item.from}</small>
            </span>
          </button>
        ))}
      </aside>
      <section className={styles.matrixColumn} aria-label="Психоматрица клиента">
        {model.keyNumbers.find((item) => item.code === "personalYear") && isYearMode ? (
          <div className={styles.yearPill}>
            Личный год {new Date().getFullYear()} — число{" "}
            {model.keyNumbers.find((item) => item.code === "personalYear")?.value} ·{" "}
            {model.keyNumbers.find((item) => item.code === "personalYear")?.meaning?.essence}
          </div>
        ) : null}
        {model.matrix ? (
          <>
            <PythagoreanMatrix
              cells={model.matrix.cells}
              selectedSelector={selectedSelector}
              onSelect={onSelect}
            />
            <p className={styles.matrixCaption}>
              Квадрат Пифагора · психоматрица по дате рождения · рабочие числа:{" "}
              {model.matrix.workingNumbersLabel || "—"}
            </p>
          </>
        ) : (
          <div className={styles.panelBox}>
            <h2 className={styles.panelTitle}>Психоматрица отключена</h2>
            <p className={styles.muted}>Включите психоматрицу в настройках расчета.</p>
          </div>
        )}
        {model.strengthLines.length > 0 ? (
          <div className={styles.linesPanel}>
            <span className={styles.kicker}>Линии силы</span>
            <div className={styles.linesGrid}>
              {model.strengthLines.map((line) => (
                <button
                  className={styles.lineButton}
                  data-selected={selectedSelector === line.selector ? "true" : undefined}
                  key={line.code}
                  onClick={() => onSelect(line.selector)}
                  type="button"
                >
                  <span>{line.label}</span>
                  <span className={styles.lineMeter} aria-hidden="true">
                    <span style={{ width: `${Math.min(100, Math.round((line.value / 7) * 100))}%` }} />
                  </span>
                  <span className={styles.lineValue}>{line.value}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {isYearMode ? <YearMonthsPanel personalYear={getPersonalYear(model)} /> : null}
      </section>
      <DetailPanel
        detail={detail}
        interpretationText={interpretationText}
        isBusy={isBusy}
        onInterpretationChange={onInterpretationChange}
        onSaveInterpretation={onSaveInterpretation}
        onApproveInterpretation={onApproveInterpretation}
      />
    </>
  );
}

export function DetailPanel({
  detail,
  interpretationText,
  isBusy,
  onInterpretationChange,
  onSaveInterpretation,
  onApproveInterpretation
}: {
  readonly detail: NumerologyWorkspaceDetail | null;
  readonly interpretationText: string;
  readonly isBusy: boolean;
  readonly onInterpretationChange: (value: string) => void;
  readonly onSaveInterpretation: () => void;
  readonly onApproveInterpretation: () => void;
}) {
  return (
    <aside className={styles.detailPanel} aria-label="Трактовка выбранного элемента">
      <div className={styles.detailHead}>
        <span className={styles.detailEyebrow}>{detail?.eyebrow ?? "выберите элемент"}</span>
        <div className={styles.detailTitleRow}>
          <span className={styles.detailValue}>{detail?.value ?? "—"}</span>
          <span>
            <strong>{detail?.title ?? "Нумерологический разбор"}</strong>
            {detail?.subtitle ? <small>{detail.subtitle}</small> : null}
          </span>
        </div>
      </div>
      <div className={styles.detailBody}>
        <p>{detail?.text ?? "Кликните число, ячейку матрицы или линию силы."}</p>
        {detail?.formula ? (
          <div className={styles.formulaBox}>
            <span>Как считается</span>
            <p>{detail.formula}</p>
          </div>
        ) : null}
        <div className={styles.manualInterpretation}>
          <span className={styles.kicker}>Ручная трактовка</span>
          <textarea
            value={interpretationText}
            onChange={(event) => onInterpretationChange(event.target.value)}
            placeholder="Введите ручную трактовку для клиента"
          />
          <div>
            <button
              type="button"
              className="eh-button eh-button--secondary"
              disabled={isBusy}
              onClick={onSaveInterpretation}
            >
              Сохранить
            </button>
            <button
              type="button"
              className="eh-button eh-button--primary"
              disabled={isBusy}
              onClick={onApproveInterpretation}
            >
              Утвердить
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function CompatibilityWorkspace({
  model,
  interpretationText,
  isBusy,
  onInterpretationChange,
  onSaveInterpretation,
  onApproveInterpretation
}: {
  readonly model: NumerologyWorkspaceModel;
  readonly interpretationText: string;
  readonly isBusy: boolean;
  readonly onInterpretationChange: (value: string) => void;
  readonly onSaveInterpretation: () => void;
  readonly onApproveInterpretation: () => void;
}) {
  const compatibility = model.compatibility;
  if (!compatibility) return null;

  return (
    <>
      <aside className={styles.keyRail} aria-label="Участники совместимости">
        {compatibility.participants.map((participant) => (
          <div className={styles.participantCard} key={participant.displayName}>
            <span className={styles.avatar}>{participant.initials}</span>
            <strong>{participant.displayName}</strong>
            <dl>
              <div>
                <dt>Путь</dt>
                <dd>{formatNumberWithMeaning(participant.lifePath)}</dd>
              </div>
              <div>
                <dt>Выражение</dt>
                <dd>{formatNumberWithMeaning(participant.expression)}</dd>
              </div>
              <div>
                <dt>Душа</dt>
                <dd>{formatNumberWithMeaning(participant.soul)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </aside>
      <section className={styles.compatibilityMatrixGrid} aria-label="Матрицы совместимости">
        {compatibility.matrices.map((item) => (
          <div className={styles.compatibilityMatrix} key={item.participant.displayName}>
            <div className={styles.compatibilityMatrixTitle}>
              <span className={styles.avatar}>{item.participant.initials}</span>
              <strong>{item.participant.displayName}</strong>
              <span>путь {item.participant.lifePath ?? "—"}</span>
            </div>
            {item.matrix ? (
              <PythagoreanMatrix
                cells={item.matrix.cells}
                selectedSelector={null}
                onSelect={() => undefined}
              />
            ) : null}
          </div>
        ))}
        <div className={styles.pairPill}>
          Число пары: <strong>{compatibility.pairNumber ?? "—"}</strong>
          {compatibility.pairMeaning ? <span> · {compatibility.pairMeaning.essence}</span> : null}
        </div>
      </section>
      <aside className={styles.detailPanel} aria-label="Разбор совместимости">
        <div className={styles.detailHead}>
          <span className={styles.detailEyebrow}>совместимость</span>
          <div className={styles.detailTitleRow}>
            <span className={styles.detailValue}>{compatibility.pairNumber ?? "—"}</span>
            <span>
              <strong>Число пары</strong>
              {compatibility.pairMeaning ? <small>{compatibility.pairMeaning.essence}</small> : null}
            </span>
          </div>
        </div>
        <div className={styles.detailBody}>
          <p>
            {compatibility.pairMeaning?.text ??
              "Сравнение строится по ключевым числам, матрицам и линиям силы двух участников."}
          </p>
          <div className={styles.comparisonList}>
            <span className={styles.kicker}>Линии матриц</span>
            {compatibility.strengthLineComparisons.map((line) => (
              <div className={styles.comparisonRow} key={line.code}>
                <span>{line.label}</span>
                <strong>{line.valueA}</strong>
                <small>·</small>
                <strong>{line.valueB}</strong>
              </div>
            ))}
          </div>
          <div className={styles.manualInterpretation}>
            <span className={styles.kicker}>Ручная трактовка</span>
            <textarea
              value={interpretationText}
              onChange={(event) => onInterpretationChange(event.target.value)}
              placeholder="Введите ручную трактовку для пары"
            />
            <div>
              <button
                type="button"
                className="eh-button eh-button--secondary"
                disabled={isBusy}
                onClick={onSaveInterpretation}
              >
                Сохранить
              </button>
              <button
                type="button"
                className="eh-button eh-button--primary"
                disabled={isBusy}
                onClick={onApproveInterpretation}
              >
                Утвердить
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function YearMonthsPanel({ personalYear }: { readonly personalYear: number | null }) {
  const months = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
  const currentMonth = new Date().getMonth();

  return (
    <div className={styles.yearMonths}>
      <span className={styles.kicker}>Личные месяцы · {new Date().getFullYear()}</span>
      <div>
        {months.map((month, index) => (
          <span data-current={index === currentMonth ? "true" : undefined} key={month}>
            <small>{month}</small>
            <strong>{personalYear ? reduceRoot(personalYear + index + 1) : "—"}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function formatNumberWithMeaning(value: number | null): string {
  if (value === null) return "—";
  return String(value);
}

function getPersonalYear(model: NumerologyWorkspaceModel): number | null {
  return model.keyNumbers.find((item) => item.code === "personalYear")?.value ?? null;
}

function reduceRoot(value: number): number {
  let result = value;
  while (result > 9) {
    result = String(result)
      .split("")
      .reduce((total, digit) => total + Number(digit), 0);
  }
  return result;
}
