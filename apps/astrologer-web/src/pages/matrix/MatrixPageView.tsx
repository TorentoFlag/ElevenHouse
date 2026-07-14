import type {
  MatrixData,
  MatrixDerivedProjection,
  MatrixInterpretationEntry,
  MatrixNote
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { ClientSearchCombobox } from "../../features/clients/components/ClientSearchCombobox";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import { MatrixDetailPanel } from "../../features/matrix/components/MatrixDetailPanel";
import { MatrixEnergyMap } from "../../features/matrix/components/MatrixEnergyMap";
import { MatrixNotesPanel } from "../../features/matrix/components/MatrixNotesPanel";
import { MatrixOctagram } from "../../features/matrix/components/MatrixOctagram";
import { MatrixRail } from "../../features/matrix/components/MatrixRail";
import { MatrixReportPanel } from "../../features/matrix/components/MatrixReportPanel";
import type {
  MatrixMode,
  MatrixReportEditor,
  MatrixSelection,
  MatrixSelector
} from "../../features/matrix/model/matrixWorkspaceModel";
import { MatrixPresentation } from "./MatrixPresentation";
import styles from "./MatrixPage.module.css";

export type MatrixSidePanel = "detail" | "notes" | "report";
export type MatrixPageViewProps = {
  readonly matrix: MatrixData | null;
  readonly projection: MatrixDerivedProjection | null;
  readonly mode: MatrixMode;
  readonly subject: ClientSelectOption | null;
  readonly partner: ClientSelectOption | null;
  readonly calculationId: string;
  readonly isLinked: boolean;
  readonly selected: MatrixSelector;
  readonly selection: MatrixSelection | null;
  readonly interpretation: MatrixInterpretationEntry | null;
  readonly notes: readonly MatrixNote[];
  readonly noteDraft: string;
  readonly selectedNoteIds: readonly string[];
  readonly reportEditor: MatrixReportEditor;
  readonly activePanel: MatrixSidePanel;
  readonly isYearMode: boolean;
  readonly isPresentationOpen: boolean;
  readonly isBusy: boolean;
  readonly isInterpretationLoading: boolean;
  readonly reportCanSave: boolean;
  readonly message: string | null;
  readonly errorMessage: string | null;
  readonly pdfLabel: string;
  readonly pdfDisabled: boolean;
  readonly onSelectSubject: (client: ClientSelectOption) => void;
  readonly onSelectPartner: (client: ClientSelectOption) => void;
  readonly onToggleCompatibility: () => void;
  readonly onToggleYear: () => void;
  readonly onSelect: (selector: MatrixSelector) => void;
  readonly onSetPanel: (panel: MatrixSidePanel) => void;
  readonly onPersist: () => void;
  readonly onOpenPresentation: () => void;
  readonly onClosePresentation: () => void;
  readonly onNoteDraftChange: (value: string) => void;
  readonly onCreateNote: () => void;
  readonly onToggleNoteForReport: (noteId: string) => void;
  readonly onUpdateNote: (noteId: string, text: string) => void;
  readonly onDeleteNote: (noteId: string) => void;
  readonly onReportChange: (key: keyof MatrixReportEditor, value: string) => void;
  readonly onGenerateReport: () => void;
  readonly onSaveReport: () => void;
  readonly onPdf: () => void;
};

export function MatrixPageView(props: MatrixPageViewProps) {
  const { matrix, projection, mode, subject, partner } = props;
  return (
    <section className={styles.page} aria-labelledby="matrix-title">
      <header className={styles.toolbar} role="toolbar" aria-label="Инструменты Матрицы судьбы">
        <div className={styles.titleGroup}>
          <span className={styles.iconBox}>
            <Icon iconName="orbit" width={19} height={19} />
          </span>
          <h1 id="matrix-title">Матрица судьбы</h1>
        </div>
        <div className={styles.clientStrip}>
          <ClientSearchCombobox
            label="Клиент"
            value={subject?.value ?? ""}
            placeholder="Выбрать клиента"
            selectedClient={subject}
            excludeClientIds={partner ? [partner.value] : []}
            disabled={props.isBusy}
            onSelect={props.onSelectSubject}
          />
          {mode === "compatibility" ? (
            <>
              <span className={styles.clientPlus}>+</span>
              <ClientSearchCombobox
                label="Партнёр"
                value={partner?.value ?? ""}
                placeholder="Выбрать партнёра"
                selectedClient={partner}
                excludeClientIds={subject ? [subject.value] : []}
                disabled={props.isBusy}
                onSelect={props.onSelectPartner}
              />
            </>
          ) : null}
        </div>
        <div className={styles.toolbarSpacer} />
        <ToolButton
          icon="clock"
          active={props.isYearMode}
          disabled={!matrix || mode === "compatibility" || props.isBusy}
          onClick={props.onToggleYear}
        >
          Год
        </ToolButton>
        <ToolButton
          icon="users"
          active={mode === "compatibility"}
          disabled={!subject || props.isBusy}
          onClick={props.onToggleCompatibility}
        >
          Партнёрская
        </ToolButton>
        <ToolButton icon="arrowUpRight" disabled={!matrix} onClick={props.onOpenPresentation}>
          Презентация
        </ToolButton>
        <ToolButton
          icon={props.isLinked ? "check" : "pin"}
          linked={props.isLinked}
          disabled={!matrix || props.isBusy || props.isLinked}
          onClick={props.onPersist}
        >
          {props.isLinked ? "Привязана" : "Привязать"}
        </ToolButton>
        <ToolButton icon="doc" disabled={props.pdfDisabled} onClick={props.onPdf}>
          {props.pdfLabel}
        </ToolButton>
      </header>
      {props.errorMessage ? <p className={styles.error}>{props.errorMessage}</p> : null}
      <div className={styles.body}>
        {matrix && props.selection ? (
          <div className={styles.workspaceGrid}>
            <MatrixRail matrix={matrix} selected={props.selected} onSelect={props.onSelect} />
            <main className={styles.workspace}>
              <section className={styles.graphCard} aria-label="Схема Матрицы судьбы">
                {projection ? (
                  <div className={styles.yearBadge}>
                    <span>{projection.yearForecast.year}</span>
                    <strong>Личный год {projection.yearForecast.personalYear}</strong>
                    <small>
                      ресурс {projection.yearForecast.resource} · задача{" "}
                      {projection.yearForecast.challenge}
                    </small>
                  </div>
                ) : null}
                <MatrixOctagram
                  matrix={matrix}
                  selected={props.selected}
                  agePointCode={projection?.ageCycle.pointCode}
                  onSelect={props.onSelect}
                />
                <div className={styles.legend}>
                  <span>
                    <i className={styles.legendPersonal} />
                    личные
                  </span>
                  <span>
                    <i className={styles.legendKarmic} />
                    кармические
                  </span>
                  <span>
                    <i className={styles.legendInner} />
                    внутренние
                  </span>
                  <span>
                    <i className={styles.legendCenter} />
                    центр
                  </span>
                </div>
              </section>
              <MatrixEnergyMap matrix={matrix} onSelect={props.onSelect} />
            </main>
            <aside className={styles.sidePanel}>
              <div className={styles.sideTabs} role="tablist">
                <SideTab
                  active={props.activePanel === "detail"}
                  onClick={() => props.onSetPanel("detail")}
                >
                  Разбор
                </SideTab>
                <SideTab
                  active={props.activePanel === "notes"}
                  onClick={() => props.onSetPanel("notes")}
                >
                  Заметки
                </SideTab>
                <SideTab
                  active={props.activePanel === "report"}
                  onClick={() => props.onSetPanel("report")}
                >
                  Отчёт
                </SideTab>
              </div>
              {props.activePanel === "detail" ? (
                <MatrixDetailPanel
                  selection={props.selection}
                  interpretation={props.interpretation}
                  isLoading={props.isInterpretationLoading}
                />
              ) : null}
              {props.activePanel === "notes" ? (
                <MatrixNotesPanel
                  calculationId={props.calculationId}
                  notes={props.notes}
                  draft={props.noteDraft}
                  selectedNoteIds={props.selectedNoteIds}
                  isBusy={props.isBusy}
                  onDraftChange={props.onNoteDraftChange}
                  onCreate={props.onCreateNote}
                  onToggleForReport={props.onToggleNoteForReport}
                  onUpdate={props.onUpdateNote}
                  onDelete={props.onDeleteNote}
                />
              ) : null}
              {props.activePanel === "report" ? (
                <MatrixReportPanel
                  calculationId={props.calculationId}
                  editor={props.reportEditor}
                  isBusy={props.isBusy}
                  canSave={props.reportCanSave}
                  selectedNotesCount={props.selectedNoteIds.length}
                  message={props.message}
                  onChange={props.onReportChange}
                  onGenerate={props.onGenerateReport}
                  onSave={props.onSaveReport}
                />
              ) : null}
              <div className={styles.chatStub}>
                <button
                  type="button"
                  disabled
                  title="Чат с клиентом будет доступен после запуска модуля сообщений"
                >
                  <Icon iconName="chat" width={14} height={14} />
                  Отправить клиенту
                </button>
                <span>Чат пока не подключён</span>
              </div>
            </aside>
          </div>
        ) : (
          <section className={styles.emptyState}>
            <span className={styles.emptyIcon}>
              <Icon iconName="orbit" width={24} height={24} />
            </span>
            <div>
              <h2>Выберите клиента</h2>
              <p>
                Расчёт строится по дате рождения из карточки CRM. Вводить данные вручную не нужно.
              </p>
            </div>
          </section>
        )}
      </div>
      {props.isPresentationOpen && matrix ? (
        <MatrixPresentation
          matrix={matrix}
          title={subject?.label ?? "Клиент"}
          onClose={props.onClosePresentation}
        />
      ) : null}
    </section>
  );
}

function ToolButton({
  icon,
  active = false,
  linked = false,
  disabled,
  onClick,
  children
}: {
  readonly icon: "clock" | "users" | "arrowUpRight" | "check" | "pin" | "doc";
  readonly active?: boolean;
  readonly linked?: boolean;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={
        linked ? styles.toolButtonLinked : active ? styles.toolButtonActive : styles.toolButton
      }
      aria-pressed={active || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon iconName={icon} width={15} height={15} />
      {children}
    </button>
  );
}

function SideTab({
  active,
  onClick,
  children
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={active ? styles.sideTabActive : styles.sideTab}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
