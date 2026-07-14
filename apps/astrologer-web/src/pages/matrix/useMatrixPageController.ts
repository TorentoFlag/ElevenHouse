import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  MatrixBaseResult,
  MatrixCalculationResponse,
  MatrixData,
  MatrixDerivedProjection,
  MatrixPreviewResponse,
  PersistMatrixCalculationRequest,
  PreviewMatrixRequest
} from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import {
  astrologerClientListQueryOptions,
  toClientSelectOptions,
  type ClientSelectOption
} from "../../features/clients/model/clientSelectorModel";
import {
  useCreateMatrixMutation,
  useCreateMatrixNoteMutation,
  useDeleteMatrixNoteMutation,
  useDownloadMatrixPdfMutation,
  useEnqueueMatrixPdfMutation,
  useGenerateMatrixReportMutation,
  useMatrixCalculationListQuery,
  useMatrixInterpretationQuery,
  useMatrixNotesQuery,
  useMatrixPdfQuery,
  useMatrixProjectionMutation,
  useMatrixReportQuery,
  usePreviewMatrixMutation,
  useSaveMatrixReportMutation,
  useUpdateMatrixNoteMutation
} from "../../features/matrix/model/matrixHooks";
import {
  createEmptyMatrixReportEditor,
  findExistingMatrixCalculation,
  getMatrixSelection,
  isMatrixReportEditorComplete,
  toMatrixCalculationResponse,
  toMatrixReportEditor,
  toSaveMatrixReportRequest,
  type MatrixMode,
  type MatrixReportEditor,
  type MatrixSelector
} from "../../features/matrix/model/matrixWorkspaceModel";
import type { MatrixPageViewProps, MatrixSidePanel } from "./MatrixPageView";

export function useMatrixPageController(): MatrixPageViewProps {
  useDocumentTitle("ElevenHouse | Матрица судьбы");
  const listQuery = useMatrixCalculationListQuery();
  const clientsQuery = useQuery(astrologerClientListQueryOptions({ limit: 100, offset: 0 }));
  const previewMutation = usePreviewMatrixMutation();
  const createMutation = useCreateMatrixMutation();
  const projectionMutation = useMatrixProjectionMutation();
  const createNoteMutation = useCreateMatrixNoteMutation();
  const updateNoteMutation = useUpdateMatrixNoteMutation();
  const deleteNoteMutation = useDeleteMatrixNoteMutation();
  const saveReportMutation = useSaveMatrixReportMutation();
  const generateReportMutation = useGenerateMatrixReportMutation();
  const enqueuePdfMutation = useEnqueueMatrixPdfMutation();
  const downloadPdfMutation = useDownloadMatrixPdfMutation();
  const calculations = useMemo(
    () => listQuery.data?.calculations ?? [],
    [listQuery.data?.calculations]
  );
  const clients = useMemo(
    () => toClientSelectOptions(clientsQuery.data?.clients ?? []),
    [clientsQuery.data?.clients]
  );
  const [mode, setMode] = useState<MatrixMode>("individual");
  const [subject, setSubject] = useState<ClientSelectOption | null>(null);
  const [partner, setPartner] = useState<ClientSelectOption | null>(null);
  const [savedResponse, setSavedResponse] = useState<MatrixCalculationResponse | null>(null);
  const [previewResponse, setPreviewResponse] = useState<MatrixPreviewResponse | null>(null);
  const [projection, setProjection] = useState<MatrixDerivedProjection | null>(null);
  const [selected, setSelected] = useState<MatrixSelector>("E");
  const [activePanel, setActivePanel] = useState<MatrixSidePanel>("detail");
  const [isYearMode, setIsYearMode] = useState(false);
  const [isPresentationOpen, setIsPresentationOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [selectedNoteIds, setSelectedNoteIds] = useState<readonly string[]>([]);
  const [reportEditor, setReportEditor] = useState<MatrixReportEditor>(() =>
    createEmptyMatrixReportEditor("ru")
  );
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const calculationId = savedResponse?.calculation.id ?? "";
  const result = savedResponse?.result ?? previewResponse?.result ?? null;
  const matrix = getResultMatrix(result);
  const selection = matrix ? getMatrixSelection(matrix, selected) : null;
  const notesQuery = useMatrixNotesQuery(calculationId);
  const reportQuery = useMatrixReportQuery(calculationId);
  const pdfQuery = useMatrixPdfQuery(calculationId);
  const interpretationQuery = useMatrixInterpretationQuery(
    { locale: "ru", arcana: selection?.arcana ?? 1, context: selection?.context ?? "portrait" },
    Boolean(selection)
  );
  const notes = useMemo(() => notesQuery.data?.notes ?? [], [notesQuery.data?.notes]);
  const report = reportQuery.data?.report ?? null;
  const pdfJob = pdfQuery.data?.job ?? null;
  const isBusy = [
    previewMutation,
    createMutation,
    projectionMutation,
    createNoteMutation,
    updateNoteMutation,
    deleteNoteMutation,
    saveReportMutation,
    generateReportMutation,
    enqueuePdfMutation,
    downloadPdfMutation
  ].some((mutation) => mutation.isPending);

  useEffect(() => {
    if (report) setReportEditor(toMatrixReportEditor(report));
    else if (calculationId && !reportQuery.isLoading)
      setReportEditor(createEmptyMatrixReportEditor("ru"));
  }, [calculationId, report, reportQuery.isLoading]);

  useEffect(() => {
    setSelectedNoteIds((ids) =>
      ids.filter((id) => notes.some((note) => note.id === id && !note.stale))
    );
  }, [notes]);

  const pdfLabel =
    pdfJob?.status === "queued" || pdfJob?.status === "processing"
      ? "PDF готовится"
      : pdfJob?.status === "ready"
        ? "Скачать PDF"
        : "PDF";
  const pdfDisabled =
    !calculationId || isBusy || pdfJob?.status === "queued" || pdfJob?.status === "processing";

  return {
    matrix,
    projection,
    mode,
    subject,
    partner,
    calculationId,
    isLinked: Boolean(savedResponse),
    selected,
    selection,
    interpretation: interpretationQuery.data?.entry ?? null,
    notes,
    noteDraft,
    selectedNoteIds,
    reportEditor,
    activePanel,
    isYearMode,
    isPresentationOpen,
    isBusy,
    isInterpretationLoading: interpretationQuery.isLoading,
    reportCanSave: isMatrixReportEditorComplete(reportEditor),
    message,
    errorMessage,
    pdfLabel,
    pdfDisabled,
    onSelectSubject: (client) => {
      setSubject(client);
      if (mode === "compatibility" && partner)
        void run(() => selectOrPreview("compatibility", client, partner));
      else void run(() => selectOrPreview("individual", client, null));
    },
    onSelectPartner: (client) => {
      setPartner(client);
      if (subject) void run(() => selectOrPreview("compatibility", subject, client));
    },
    onToggleCompatibility: () => {
      if (!subject) return;
      if (mode === "compatibility") {
        setMode("individual");
        setPartner(null);
        setIsYearMode(false);
        void run(() => selectOrPreview("individual", subject, null));
        return;
      }
      const nextPartner =
        clients.find((client) => client.hasBirthDate && client.value !== subject.value) ?? null;
      setMode("compatibility");
      setIsYearMode(false);
      setProjection(null);
      setPartner(nextPartner);
      if (nextPartner) void run(() => selectOrPreview("compatibility", subject, nextPartner));
      else {
        setSavedResponse(null);
        setPreviewResponse(null);
      }
    },
    onToggleYear: () => {
      if (!subject || mode !== "individual") return;
      const next = !isYearMode;
      setIsYearMode(next);
      if (!next) {
        setProjection(null);
        if (!savedResponse) void run(() => selectOrPreview("individual", subject, null, false));
        return;
      }
      void run(async () => {
        if (savedResponse) {
          const response = await projectionMutation.mutateAsync({
            calculationId,
            year: new Date().getFullYear()
          });
          setProjection(response.projection);
        } else {
          await selectOrPreview("individual", subject, null, true);
        }
      });
    },
    onSelect: (selector) => {
      setSelected(selector);
      setActivePanel("detail");
    },
    onSetPanel: setActivePanel,
    onPersist: () => {
      if (!subject || savedResponse) return;
      void run(async () => {
        const response = await createMutation.mutateAsync(toPersistRequest(mode, subject, partner));
        setSavedResponse(response);
        setPreviewResponse(null);
        setProjection(null);
        setMessage("Расчёт привязан к выбранному клиенту.");
      });
    },
    onOpenPresentation: () => setIsPresentationOpen(true),
    onClosePresentation: () => setIsPresentationOpen(false),
    onNoteDraftChange: setNoteDraft,
    onCreateNote: () => {
      if (!calculationId || !noteDraft.trim() || !savedResponse) return;
      void run(async () => {
        await createNoteMutation.mutateAsync({
          calculationId,
          body: {
            text: noteDraft.trim(),
            expectedResultChecksum: savedResponse.calculation.resultChecksum
          }
        });
        setNoteDraft("");
      });
    },
    onToggleNoteForReport: (noteId) =>
      setSelectedNoteIds((ids) =>
        ids.includes(noteId) ? ids.filter((id) => id !== noteId) : [...ids, noteId]
      ),
    onUpdateNote: (noteId, text) => {
      if (!calculationId || !savedResponse || !text.trim()) return;
      void run(() =>
        updateNoteMutation
          .mutateAsync({
            calculationId,
            noteId,
            body: {
              text: text.trim(),
              expectedResultChecksum: savedResponse.calculation.resultChecksum
            }
          })
          .then(() => undefined)
      );
    },
    onDeleteNote: (noteId) => {
      if (calculationId)
        void run(() =>
          deleteNoteMutation.mutateAsync({ calculationId, noteId }).then(() => undefined)
        );
    },
    onReportChange: (key, value) => setReportEditor((current) => ({ ...current, [key]: value })),
    onGenerateReport: () => {
      if (!savedResponse) return;
      void run(async () => {
        const response = await generateReportMutation.mutateAsync({
          calculationId,
          body: {
            locale: "ru",
            noteIds: [...selectedNoteIds],
            projectionYear: isYearMode ? new Date().getFullYear() : null,
            expectedResultChecksum: savedResponse.calculation.resultChecksum
          }
        });
        if (response.report) setReportEditor(toMatrixReportEditor(response.report));
        setMessage("AI-черновик создан. Проверьте текст перед сохранением и PDF.");
      });
    },
    onSaveReport: () => {
      if (!savedResponse) return;
      void run(async () => {
        const response = await saveReportMutation.mutateAsync({
          calculationId,
          body: toSaveMatrixReportRequest(reportEditor, savedResponse.calculation.resultChecksum)
        });
        if (response.report) setReportEditor(toMatrixReportEditor(response.report));
        setMessage(
          reportEditor.status === "ready"
            ? "Отчёт готов к формированию PDF."
            : "Черновик отчёта сохранён."
        );
      });
    },
    onPdf: () => {
      if (!savedResponse) return;
      if (!report || report.stale || report.status !== "ready") {
        setActivePanel("report");
        setMessage("Заполните отчёт, выберите статус «Готов к PDF» и сохраните его.");
        return;
      }
      void run(async () => {
        if (pdfJob?.status === "ready") {
          const download = await downloadPdfMutation.mutateAsync({
            calculationId,
            jobId: pdfJob.id
          });
          window.open(download.url, "_blank", "noopener,noreferrer");
          return;
        }
        await enqueuePdfMutation.mutateAsync({
          calculationId,
          body: { expectedResultChecksum: savedResponse.calculation.resultChecksum }
        });
        setMessage("PDF поставлен в очередь. Кнопка обновится автоматически.");
      });
    }
  };

  async function selectOrPreview(
    nextMode: MatrixMode,
    nextSubject: ClientSelectOption,
    nextPartner: ClientSelectOption | null,
    withYear = isYearMode
  ): Promise<void> {
    if (!nextSubject.hasBirthDate || (nextMode === "compatibility" && !nextPartner?.hasBirthDate)) {
      setErrorMessage("У выбранного клиента должна быть указана дата рождения в CRM.");
      return;
    }
    const existing = findExistingMatrixCalculation(calculations, {
      mode: nextMode,
      subjectClientId: nextSubject.value,
      ...(nextPartner ? { partnerClientId: nextPartner.value } : {})
    });
    setMode(nextMode);
    setSelected("E");
    setProjection(null);
    setMessage(null);
    if (existing) {
      setSavedResponse(toMatrixCalculationResponse(existing));
      setPreviewResponse(null);
      if (withYear && nextMode === "individual") {
        const response = await projectionMutation.mutateAsync({
          calculationId: existing.id,
          year: new Date().getFullYear()
        });
        setProjection(response.projection);
      }
      return;
    }
    setSavedResponse(null);
    const response = await previewMutation.mutateAsync(
      toPreviewRequest(nextMode, nextSubject, nextPartner, withYear)
    );
    setPreviewResponse(response);
    setProjection(response.projection);
  }

  async function run(operation: () => Promise<void>): Promise<void> {
    try {
      setErrorMessage(null);
      await operation();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось выполнить действие");
    }
  }
}

function getResultMatrix(result: MatrixBaseResult | null): MatrixData | null {
  if (!result) return null;
  return result.mode === "individual" ? result.matrix : result.composite;
}

function toPreviewRequest(
  mode: MatrixMode,
  subject: ClientSelectOption,
  partner: ClientSelectOption | null,
  withYear: boolean
): PreviewMatrixRequest {
  if (mode === "compatibility")
    return {
      methodCode: "ladini_22" as const,
      mode,
      participants: [
        { role: "subject" as const, source: "crm_client" as const, clientId: subject.value },
        { role: "partner" as const, source: "crm_client" as const, clientId: partner!.value }
      ],
      projection: { kind: "none" as const }
    };
  return {
    methodCode: "ladini_22" as const,
    mode,
    participants: [
      { role: "subject" as const, source: "crm_client" as const, clientId: subject.value }
    ],
    projection: withYear ? { kind: "current_year" as const } : { kind: "none" as const }
  };
}

function toPersistRequest(
  mode: MatrixMode,
  subject: ClientSelectOption,
  partner: ClientSelectOption | null
): PersistMatrixCalculationRequest {
  if (mode === "compatibility")
    return {
      methodCode: "ladini_22" as const,
      mode,
      participants: [
        { role: "subject" as const, source: "crm_client" as const, clientId: subject.value },
        { role: "partner" as const, source: "crm_client" as const, clientId: partner!.value }
      ]
    };
  return {
    methodCode: "ladini_22" as const,
    mode,
    participants: [
      { role: "subject" as const, source: "crm_client" as const, clientId: subject.value }
    ]
  };
}
