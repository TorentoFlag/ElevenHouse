import { useState, type ChangeEvent, type FormEvent } from "react";
import type {
  GetAstrologerVerificationResponse,
  SubmitAstrologerVerificationRequest
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { uploadMediaFile } from "../../media/api/uploadMediaFile";
import styles from "../../../pages/settings/SettingsPage.module.css";

export type VerificationSettingsPanelProps = {
  readonly verification: GetAstrologerVerificationResponse | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isSubmitting: boolean;
  readonly submitStatus: "submitted" | null;
  readonly onSubmit: (body: SubmitAstrologerVerificationRequest) => void;
};

type UploadedDocument = {
  readonly mediaId: string;
  readonly fileName: string;
};

export function VerificationSettingsPanel({
  verification,
  isLoading,
  isError,
  isSubmitting,
  submitStatus,
  onSubmit
}: VerificationSettingsPanelProps) {
  const [identityDocument, setIdentityDocument] = useState<UploadedDocument | null>(null);
  const [qualificationDocuments, setQualificationDocuments] = useState<UploadedDocument[]>([]);
  const [uploadingKind, setUploadingKind] = useState<"identity" | "qualification" | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (isLoading) {
    return <div className={styles.statusBanner}>Загружаем статус верификации</div>;
  }
  if (isError) {
    return (
      <div className={`${styles.statusBanner} ${styles.statusBannerDanger}`}>
        Не удалось загрузить статус верификации. Повторите попытку позже.
      </div>
    );
  }

  const current = verification?.application ?? null;
  const status = verification?.status ?? "none";
  const canSubmit = status === "none" || status === "rejected" || status === "revoked";
  const canSend =
    canSubmit && Boolean(identityDocument) && qualificationDocuments.length > 0 && !uploadingKind;

  const handleIdentityFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setUploadingKind("identity");
    setUploadError(null);
    try {
      const media = await uploadMediaFile({
        purpose: "verification_identity_document",
        file
      });
      setIdentityDocument({
        mediaId: media.id,
        fileName: media.originalFileName
      });
    } catch {
      setUploadError("Не удалось загрузить документ личности. Проверьте формат и размер файла.");
    } finally {
      setUploadingKind(null);
    }
  };
  const handleQualificationFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0) return;

    setUploadingKind("qualification");
    setUploadError(null);
    try {
      const uploaded = await Promise.all(
        files.slice(0, 5 - qualificationDocuments.length).map(async (file) => {
          const media = await uploadMediaFile({
            purpose: "verification_qualification_document",
            file
          });
          return {
            mediaId: media.id,
            fileName: media.originalFileName
          };
        })
      );
      setQualificationDocuments((currentDocuments) => [...currentDocuments, ...uploaded]);
    } catch {
      setUploadError("Не удалось загрузить сертификат. Проверьте формат и размер файла.");
    } finally {
      setUploadingKind(null);
    }
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend || !identityDocument) return;

    onSubmit({
      identityDocumentMediaId: identityDocument.mediaId,
      qualificationDocumentMediaIds: qualificationDocuments.map((document) => document.mediaId)
    });
  };

  return (
    <section className={styles.profileForm} aria-label="Верификация">
      {submitStatus === "submitted" ? (
        <div className={`${styles.statusBanner} ${styles.statusBannerSuccess}`}>
          Документы отправлены на проверку
        </div>
      ) : null}
      <section className={styles.settingsGroup}>
        <h2>Статус верификации</h2>
        <p>Отметка доверия на личной странице появляется после проверки личности и квалификации.</p>
        <div className={styles.billingProviderNotice}>
          <Icon iconName="verified" width={18} height={18} aria-hidden="true" />
          <span>
            <strong>{formatVerificationStatus(status)}</strong>
            <em>{formatVerificationHint(status, current?.rejectionReason ?? null)}</em>
          </span>
        </div>
        {current ? (
          <div className={styles.billingPanel} aria-label="Отправленные документы">
            {current.documents.map((document) => (
              <div className={styles.billingRow} key={document.id}>
                <strong>
                  {document.kind === "identity" ? "Подтверждение личности" : "Квалификация"}
                </strong>
                <em>{document.originalFileName}</em>
                <span className={styles.currentPlanStatus}>отправлен</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {canSubmit ? (
        <form onSubmit={handleSubmit}>
          <section className={styles.settingsGroup}>
            <h2>Документы</h2>
            <p>Файлы видны только модераторам платформы. Поддерживаются PDF, JPG и PNG.</p>
            <label className={styles.field}>
              <span>Подтверждение личности</span>
              <input
                accept="application/pdf,image/jpeg,image/png"
                disabled={isSubmitting || Boolean(uploadingKind)}
                onChange={handleIdentityFile}
                type="file"
              />
            </label>
            <DocumentList documents={identityDocument ? [identityDocument] : []} />
            <label className={styles.field}>
              <span>
                Сертификаты / дипломы <em>до 5 файлов</em>
              </span>
              <input
                accept="application/pdf,image/jpeg,image/png"
                disabled={
                  isSubmitting ||
                  Boolean(uploadingKind) ||
                  qualificationDocuments.length >=
                    (verification?.requirements.maxQualificationDocuments ?? 5)
                }
                multiple
                onChange={handleQualificationFile}
                type="file"
              />
            </label>
            <DocumentList documents={qualificationDocuments} />
            {uploadError ? (
              <p className={styles.formError} role="alert">
                {uploadError}
              </p>
            ) : null}
            <div className={styles.actions}>
              <button className={styles.primaryButton} disabled={!canSend || isSubmitting} type="submit">
                <Icon iconName="check" width={15} height={15} aria-hidden="true" />
                {isSubmitting ? "Отправляем" : "Отправить на проверку"}
              </button>
              {uploadingKind ? <span className={styles.profileMediaError}>Загружаем файл</span> : null}
            </div>
          </section>
        </form>
      ) : null}
    </section>
  );
}

function DocumentList({ documents }: { readonly documents: readonly UploadedDocument[] }) {
  if (documents.length === 0) return null;

  return (
    <div className={styles.chipList}>
      {documents.map((document) => (
        <span className={styles.chip} key={document.mediaId}>
          <Icon iconName="fileDown" width={13} height={13} aria-hidden="true" />
          {document.fileName}
        </span>
      ))}
    </div>
  );
}

function formatVerificationStatus(status: GetAstrologerVerificationResponse["status"]): string {
  switch (status) {
    case "none":
      return "Не подана";
    case "pending":
      return "На модерации";
    case "approved":
      return "Верифицирован";
    case "rejected":
      return "Отклонена";
    case "revoked":
      return "Отметка отозвана";
  }
}

function formatVerificationHint(
  status: GetAstrologerVerificationResponse["status"],
  rejectionReason: string | null
): string {
  switch (status) {
    case "none":
      return "Можно пройти в любой момент, даже если шаг был пропущен в онбординге.";
    case "pending":
      return "Документы отправлены. Обычно проверяем за 1-2 дня.";
    case "approved":
      return "Отметка доверия активна на личной странице.";
    case "rejected":
      return rejectionReason ? `Причина: ${rejectionReason}` : "Можно исправить документы и подать повторно.";
    case "revoked":
      return "Повторная проверка доступна после обновления документов.";
  }
}
