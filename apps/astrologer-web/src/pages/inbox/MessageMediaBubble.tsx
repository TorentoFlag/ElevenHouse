import { useState } from "react";
import type { MessagingMessage } from "@elevenhouse/contracts";
import styles from "./InboxPage.module.css";

type MediaSource = {
  readonly url: string;
  readonly mimeType: string;
};

export function MessageMediaBubble({
  message,
  onLoadSource
}: {
  readonly message: MessagingMessage;
  readonly onLoadSource: (messageId: string) => Promise<{
    readonly url: string;
    readonly expiresAt: string;
    readonly mimeType: string;
  }>;
}) {
  const [source, setSource] = useState<MediaSource | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const media = message.media;
  const kind = media?.kind ?? message.contentType;
  const labels = labelsForKind(kind);
  const label = message.text?.trim() || labels.title;

  if (!media || media.status === "pending") {
    return (
      <div className={styles.mediaMessage}>
        <p>{label}</p>
        <button className={styles.mediaButton} type="button" disabled>
          {labels.loading}
        </button>
      </div>
    );
  }

  if (media.status === "failed") {
    return (
      <div className={styles.mediaMessage}>
        <p>{label}</p>
        <button className={styles.mediaButton} type="button" disabled>
          {labels.failed}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.mediaMessage}>
      <p>{label}</p>
      {source ? (
        renderMediaElement(kind, source, label)
      ) : (
        <button
          className={styles.mediaButton}
          type="button"
          disabled={isLoading}
          onClick={() => {
            setIsLoading(true);
            setError(null);
            onLoadSource(message.id)
              .then((result) => setSource({ url: result.url, mimeType: result.mimeType }))
              .catch(() => setError(labels.error))
              .finally(() => setIsLoading(false));
          }}
        >
          {isLoading ? labels.loadingActive : labels.action}
        </button>
      )}
      {media.durationSeconds !== null && (
        <span className={styles.mediaMeta}>{formatDuration(media.durationSeconds)}</span>
      )}
      {error && (
        <span className={styles.mediaError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function renderMediaElement(
  kind: MessagingMessage["contentType"],
  source: MediaSource,
  label: string
) {
  if (kind === "image") {
    return <img className={styles.mediaImage} src={source.url} alt={label || "Изображение"} />;
  }

  if (kind === "video_note") {
    return (
      <video
        className={styles.mediaVideoNote}
        aria-label="Видео кружок"
        controls
        preload="metadata"
        src={source.url}
      />
    );
  }

  if (kind === "video") {
    return (
      <video
        className={styles.mediaVideo}
        aria-label="Видео"
        controls
        preload="metadata"
        src={source.url}
      />
    );
  }

  return (
    <audio
      className={styles.mediaAudio}
      aria-label="Голосовое сообщение"
      controls
      preload="metadata"
      src={source.url}
    />
  );
}

function labelsForKind(kind: MessagingMessage["contentType"]) {
  if (kind === "image") {
    return {
      title: "Изображение",
      loading: "Изображение загружается",
      failed: "Изображение недоступно",
      action: "Показать изображение",
      loadingActive: "Загружаем изображение",
      error: "Не удалось загрузить изображение"
    };
  }

  if (kind === "video_note") {
    return {
      title: "Видео кружок",
      loading: "Видео загружается",
      failed: "Видео недоступно",
      action: "Воспроизвести видео",
      loadingActive: "Загружаем видео",
      error: "Не удалось загрузить видео"
    };
  }

  if (kind === "video") {
    return {
      title: "Видео",
      loading: "Видео загружается",
      failed: "Видео недоступно",
      action: "Воспроизвести видео",
      loadingActive: "Загружаем видео",
      error: "Не удалось загрузить видео"
    };
  }

  return {
    title: "Голосовое сообщение",
    loading: "Голос загружается",
    failed: "Голосовое сообщение недоступно",
    action: "Воспроизвести голосовое",
    loadingActive: "Загружаем аудио",
    error: "Не удалось загрузить аудио"
  };
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
