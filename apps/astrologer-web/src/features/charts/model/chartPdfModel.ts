import type {
  CalculationPdfDownloadResponse,
  CalculationPdfJob,
  CalculationPdfLocale
} from "@elevenhouse/contracts";
import { HttpError } from "../../../common/http/HttpError";
import { chartEngineCopyByLocale } from "./chartEngineCopy";

export type ChartPdfAction = {
  readonly kind: "disabled" | "request" | "pending" | "download" | "retry";
  readonly label: string;
  readonly disabled: boolean;
  readonly title: string;
  readonly errorMessage: string | null;
};

export type ChartPdfDownloadWindow = {
  readonly close: () => void;
  readonly location: {
    href: string;
  };
};

export function buildChartPdfAction(input: {
  readonly calculationId: string | null;
  readonly currentResultChecksum: string | null;
  readonly job: CalculationPdfJob | null;
  readonly isBusy: boolean;
  readonly isResultStale: boolean;
  readonly locale?: CalculationPdfLocale;
}): ChartPdfAction {
  const copy = chartEngineCopyByLocale[input.locale ?? "ru"].pdf;
  if (!input.calculationId) {
    return action("disabled", "PDF", true, copy.calculateFirst);
  }
  if (input.isResultStale) {
    return action("disabled", "PDF", true, copy.recalculateFirst);
  }
  if (!input.currentResultChecksum) {
    return action("disabled", "PDF", true, copy.loading);
  }

  const job =
    input.job &&
    input.job.calculationId === input.calculationId &&
    input.job.resultChecksum === input.currentResultChecksum
      ? input.job
      : null;

  if (job?.status === "queued" || job?.status === "processing") {
    return action("pending", copy.preparing, true, copy.forming);
  }

  if (job?.status === "ready") {
    return action("download", copy.download, input.isBusy, copy.downloadTitle);
  }

  if (job?.status === "failed") {
    return action(
      "retry",
      copy.retry,
      input.isBusy,
      copy.retryTitle,
      job.failureReason ? copy.failed(job.failureReason) : copy.failedDefault
    );
  }

  return action("request", "PDF", input.isBusy, copy.form);
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
    throw new Error(getChartPdfActionErrorMessage(error, input.locale), { cause: error });
  }

  return "skipped";
}

export function reserveChartPdfDownloadWindow(input: {
  readonly kind: ChartPdfAction["kind"];
  readonly openWindow: (url: string, target: string) => ChartPdfDownloadWindow | null;
}): ChartPdfDownloadWindow | null {
  if (input.kind !== "download") return null;
  const downloadWindow = input.openWindow("about:blank", "_blank");
  if (downloadWindow) {
    downloadWindow.location.href = "about:blank";
  }
  return downloadWindow;
}

export function openChartPdfDownloadUrl(input: {
  readonly url: string;
  readonly downloadWindow: ChartPdfDownloadWindow | null;
  readonly navigateCurrentWindow: (url: string) => void;
}): "reserved-window" | "current-window" {
  if (input.downloadWindow) {
    input.downloadWindow.location.href = input.url;
    return "reserved-window";
  }

  input.navigateCurrentWindow(input.url);
  return "current-window";
}

export function closeReservedChartPdfWindow(input: {
  readonly downloadWindow: ChartPdfDownloadWindow | null;
}): void {
  input.downloadWindow?.close();
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

function getChartPdfActionErrorMessage(error: unknown, locale: CalculationPdfLocale): string {
  const copy = chartEngineCopyByLocale[locale].pdf;
  if (error instanceof HttpError) {
    if (error.status === 409) {
      return copy.changed;
    }
    if (error.status === 404) {
      return copy.unavailable;
    }
  }

  return copy.genericError;
}
