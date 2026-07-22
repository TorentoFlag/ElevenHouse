import type {
  CalculationPdfDownloadResponse,
  CalculationPdfJob,
  CalculationPdfLocale
} from "@elevenhouse/contracts";
import { HttpError } from "../../../common/http/HttpError";

export type ChartPdfAction = {
  readonly kind: "disabled" | "request" | "pending" | "download" | "retry";
  readonly label: string;
  readonly disabled: boolean;
  readonly title: string;
  readonly errorMessage: string | null;
};

export function buildChartPdfAction(input: {
  readonly calculationId: string | null;
  readonly currentResultChecksum: string | null;
  readonly job: CalculationPdfJob | null;
  readonly isBusy: boolean;
  readonly isResultStale: boolean;
}): ChartPdfAction {
  if (!input.calculationId) {
    return action("disabled", "PDF", true, "Сначала рассчитайте карту");
  }
  if (input.isResultStale) {
    return action("disabled", "PDF", true, "Сначала пересчитайте карту");
  }
  if (!input.currentResultChecksum) {
    return action("disabled", "PDF", true, "Загружаем состояние PDF");
  }

  const job =
    input.job &&
    input.job.calculationId === input.calculationId &&
    input.job.resultChecksum === input.currentResultChecksum
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

export async function executeChartPdfAction(input: {
  readonly calculationId: string | null;
  readonly locale: CalculationPdfLocale;
  readonly currentResultChecksum: string | null;
  readonly kind: ChartPdfAction["kind"];
  readonly job: CalculationPdfJob | null;
  readonly enqueue: (request: {
    readonly calculationId: string;
    readonly body: {
      readonly expectedResultChecksum: string;
      readonly locale: CalculationPdfLocale;
    };
  }) => Promise<unknown>;
  readonly download: (request: {
    readonly calculationId: string;
    readonly jobId: string;
  }) => Promise<CalculationPdfDownloadResponse>;
  readonly openUrl: (url: string) => unknown;
}): Promise<"skipped" | "enqueued" | "downloaded"> {
  if (!input.calculationId || !input.currentResultChecksum) return "skipped";

  try {
    if (input.kind === "download" && input.job?.status === "ready") {
      const response = await input.download({
        calculationId: input.calculationId,
        jobId: input.job.id
      });
      input.openUrl(response.url);
      return "downloaded";
    }

    if (input.kind === "request" || input.kind === "retry") {
      await input.enqueue({
        calculationId: input.calculationId,
        body: {
          expectedResultChecksum: input.currentResultChecksum,
          locale: input.locale
        }
      });
      return "enqueued";
    }
  } catch (error) {
    throw new Error(getChartPdfActionErrorMessage(error), { cause: error });
  }

  return "skipped";
}

function action(
  kind: ChartPdfAction["kind"],
  label: string,
  disabled: boolean,
  title: string,
  errorMessage: string | null = null
): ChartPdfAction {
  return { kind, label, disabled, title, errorMessage };
}

function getChartPdfActionErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 409) {
      return "Карта изменилась. Пересчитайте её и сформируйте PDF заново";
    }
    if (error.status === 404) {
      return "PDF-экспорт карты временно недоступен. Повторите позже";
    }
  }

  return "Не удалось выполнить действие с PDF. Повторите позже";
}
