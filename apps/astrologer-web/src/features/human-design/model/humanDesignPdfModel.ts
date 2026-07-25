import type {
  CalculationPdfDownloadResponse,
  CalculationPdfJob,
  CalculationPdfLocale
} from "@elevenhouse/contracts";
import { HttpError } from "../../../common/http/HttpError";

export type HumanDesignPdfAction = {
  readonly kind: "disabled" | "request" | "pending" | "download" | "retry";
  readonly label: string;
  readonly disabled: boolean;
  readonly title: string;
  readonly errorMessage: string | null;
};

export function buildHumanDesignPdfAction(input: {
  readonly calculationId: string | null;
  readonly resultChecksum: string | null;
  readonly currentResultChecksum: string | null;
  readonly job: CalculationPdfJob | null;
  readonly isBusy: boolean;
  readonly isTransitMode: boolean;
}): HumanDesignPdfAction {
  if (!input.calculationId || !input.resultChecksum) {
    return action("disabled", "PDF", true, "Сначала сохраните расчёт");
  }
  if (input.isTransitMode) {
    return action(
      "disabled",
      "PDF",
      true,
      "PDF доступен для сохранённого индивидуального расчёта, не для транзитного overlay"
    );
  }
  if (!input.currentResultChecksum) {
    return action("disabled", "PDF", true, "Загружаем состояние PDF");
  }

  const job =
    input.job &&
    input.job.calculationId === input.calculationId &&
    input.job.resultChecksum === input.resultChecksum &&
    input.currentResultChecksum === input.resultChecksum
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

export async function executeHumanDesignPdfAction(input: {
  readonly calculationId: string | null;
  readonly resultChecksum: string | null;
  readonly locale: CalculationPdfLocale;
  readonly kind: HumanDesignPdfAction["kind"];
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
  if (!input.calculationId || !input.resultChecksum) return "skipped";

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
          expectedResultChecksum: input.resultChecksum,
          locale: input.locale
        }
      });
      return "enqueued";
    }
  } catch (error) {
    throw new Error(getHumanDesignPdfActionErrorMessage(error), { cause: error });
  }

  return "skipped";
}

function action(
  kind: HumanDesignPdfAction["kind"],
  label: string,
  disabled: boolean,
  title: string,
  errorMessage: string | null = null
): HumanDesignPdfAction {
  return { kind, label, disabled, title, errorMessage };
}

function getHumanDesignPdfActionErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 409) {
      return "Расчёт Human Design изменился. Обновите его и сформируйте PDF заново";
    }
    if (error.status === 404) {
      return "PDF-экспорт Human Design временно недоступен. Повторите позже";
    }
  }

  return "Не удалось выполнить действие с PDF. Повторите позже";
}
