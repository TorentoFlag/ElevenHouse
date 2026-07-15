import type { CalculationPdfJob } from "@elevenhouse/contracts";

export type NumerologyPdfAction = {
  readonly kind: "disabled" | "request" | "pending" | "download" | "retry";
  readonly label: string;
  readonly disabled: boolean;
  readonly title: string;
  readonly errorMessage: string | null;
};

export function buildNumerologyPdfAction(input: {
  readonly calculationId: string;
  readonly resultChecksum: string;
  readonly currentResultChecksum: string | null;
  readonly job: CalculationPdfJob | null;
  readonly editorOpen: boolean;
  readonly isBusy: boolean;
}): NumerologyPdfAction {
  if (!input.calculationId || !input.resultChecksum || input.editorOpen) {
    return action("disabled", "PDF", true, "Сначала сохраните расчёт");
  }

  const job =
    input.job &&
    input.job.calculationId === input.calculationId &&
    input.job.resultChecksum === input.resultChecksum &&
    (!input.currentResultChecksum || input.currentResultChecksum === input.resultChecksum)
      ? input.job
      : null;

  if (job?.status === "queued" || job?.status === "processing") {
    return action("pending", "PDF готовится…", true, "PDF формируется");
  }

  if (job?.status === "ready") {
    return action("download", "Скачать PDF", input.isBusy, "Скачать готовый PDF");
  }

  if (job?.status === "failed") {
    return action(
      "retry",
      "Повторить",
      input.isBusy,
      "Повторить формирование PDF",
      job.failureReason
        ? `Не удалось сформировать PDF: ${job.failureReason}`
        : "Не удалось сформировать PDF. Повторите попытку."
    );
  }

  return action("request", "PDF", input.isBusy, "Сформировать PDF");
}

function action(
  kind: NumerologyPdfAction["kind"],
  label: string,
  disabled: boolean,
  title: string,
  errorMessage: string | null = null
): NumerologyPdfAction {
  return { kind, label, disabled, title, errorMessage };
}
