import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { MessagingMessage } from "@elevenhouse/contracts";
import styles from "./InboxPage.module.css";

type MediaSource = {
  readonly url: string;
  readonly mimeType: string;
};

const pendingMediaSources = new Map<string, Promise<MediaSource>>();
const voiceWaveHeights = [7, 12, 16, 10, 14, 18, 8, 13, 16, 11, 6, 14, 17, 9, 12, 7, 15, 10];

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
  const errorMessage = labels.error;
  const className = mediaMessageClassName(kind);

  useEffect(() => {
    if (!media || media.status !== "ready" || source || error) {
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);

    loadMediaSource(message.id, onLoadSource)
      .then((result) => {
        if (!cancelled) {
          setSource(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(errorMessage);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [error, errorMessage, media, message.id, onLoadSource, source]);

  if (!media || media.status === "pending") {
    return (
      <div className={className}>
        <MediaSkeleton
          kind={kind}
          label={labels.loading}
          durationSeconds={media?.durationSeconds}
        />
      </div>
    );
  }

  if (media.status === "failed") {
    return (
      <div className={className}>
        <div className={styles.mediaUnavailable} role="status">
          {labels.failed}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {source ? (
        <MediaElement
          kind={kind}
          source={source}
          label={label}
          durationSeconds={media.durationSeconds}
        />
      ) : (
        <MediaSkeleton
          kind={kind}
          label={isLoading ? labels.loadingActive : labels.loading}
          durationSeconds={media.durationSeconds}
        />
      )}
      {error && (
        <span className={styles.mediaError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function mediaMessageClassName(kind: MessagingMessage["contentType"]): string {
  const classNames = [styles.mediaMessage];

  if (kind === "image") {
    classNames.push(styles.mediaMessageImage);
  } else if (kind === "video_note") {
    classNames.push(styles.mediaMessageVideoNote);
  } else if (kind === "video") {
    classNames.push(styles.mediaMessageVideo);
  } else if (kind === "voice") {
    classNames.push(styles.mediaMessageVoice);
  }

  return classNames.join(" ");
}

function loadMediaSource(
  messageId: string,
  onLoadSource: (messageId: string) => Promise<{
    readonly url: string;
    readonly expiresAt: string;
    readonly mimeType: string;
  }>
): Promise<MediaSource> {
  const pending = pendingMediaSources.get(messageId);

  if (pending) {
    return pending;
  }

  const request = onLoadSource(messageId)
    .then((result) => ({ url: result.url, mimeType: result.mimeType }))
    .finally(() => pendingMediaSources.delete(messageId));

  pendingMediaSources.set(messageId, request);
  return request;
}

function MediaSkeleton({
  kind,
  label,
  durationSeconds
}: {
  readonly kind: MessagingMessage["contentType"];
  readonly label: string;
  readonly durationSeconds: number | null | undefined;
}) {
  const className =
    kind === "image"
      ? styles.mediaImageSkeleton
      : kind === "video_note"
        ? styles.mediaVideoNoteSkeleton
        : kind === "video"
          ? styles.mediaVideoSkeleton
          : styles.mediaAudioSkeleton;

  return (
    <div className={className} aria-label={label} role="status">
      {kind !== "image" && kind !== "video" && kind !== "video_note" && (
        <>
          <span className={styles.mediaPlaySkeleton} aria-hidden="true" />
          <span className={styles.mediaWaveSkeleton} aria-hidden="true" />
        </>
      )}
      {durationSeconds !== null && durationSeconds !== undefined && (
        <span className={styles.mediaSkeletonDuration}>{formatDuration(durationSeconds)}</span>
      )}
    </div>
  );
}

function MediaElement({
  kind,
  source,
  label,
  durationSeconds
}: {
  readonly kind: MessagingMessage["contentType"];
  readonly source: MediaSource;
  readonly label: string;
  readonly durationSeconds: number | null;
}) {
  if (kind === "image") {
    return (
      <img
        className={styles.mediaImage}
        src={source.url}
        alt={label || "Изображение"}
        loading="lazy"
      />
    );
  }

  if (kind === "video_note") {
    return (
      <video
        className={styles.mediaVideoNote}
        aria-label="Видео кружок"
        controls
        playsInline
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
        playsInline
        preload="metadata"
        src={source.url}
      />
    );
  }

  if (kind === "voice") {
    return <VoicePlayer source={source} durationSeconds={durationSeconds} />;
  }

  return (
    <audio
      className={styles.mediaHiddenAudio}
      aria-label="Голосовое сообщение"
      controls
      preload="metadata"
      src={source.url}
    />
  );
}

function VoicePlayer({
  source,
  durationSeconds
}: {
  readonly source: MediaSource;
  readonly durationSeconds: number | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [metadataDuration, setMetadataDuration] = useState<number | null>(null);
  const totalSeconds = metadataDuration ?? durationSeconds ?? 0;
  const progress = totalSeconds > 0 ? Math.min(currentTime / totalSeconds, 1) : 0;
  const activeBars = Math.round(progress * voiceWaveHeights.length);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setMetadataDuration(null);
  }, [source.url]);

  const togglePlayback = () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (audio.paused) {
      void audio.play().then(
        () => setIsPlaying(true),
        () => setIsPlaying(false)
      );
      return;
    }

    audio.pause();
    setIsPlaying(false);
  };

  return (
    <div className={styles.voicePlayer}>
      <audio
        ref={audioRef}
        className={styles.mediaHiddenAudio}
        aria-label="Голосовое сообщение"
        preload="metadata"
        src={source.url}
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={(event) => setMetadataDuration(Math.round(event.currentTarget.duration))}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />
      <button
        className={styles.voicePlayButton}
        type="button"
        aria-label={isPlaying ? "Пауза" : "Воспроизвести голосовое"}
        onClick={togglePlayback}
      >
        <span
          className={isPlaying ? styles.voicePauseIcon : styles.voicePlayIcon}
          aria-hidden="true"
        />
      </button>
      <span className={styles.voiceWave} aria-hidden="true">
        {voiceWaveHeights.map((height, index) => (
          <span
            key={`${height}-${index}`}
            className={index < activeBars ? styles.voiceWaveBarActive : styles.voiceWaveBar}
            style={{ "--voice-bar-height": `${height}px` } as CSSProperties}
          />
        ))}
      </span>
      <span className={styles.voiceDuration}>{formatDuration(Math.round(totalSeconds))}</span>
    </div>
  );
}

function labelsForKind(kind: MessagingMessage["contentType"]) {
  if (kind === "image") {
    return {
      title: "Изображение",
      loading: "Изображение загружается",
      failed: "Изображение недоступно",
      loadingActive: "Загружаем изображение",
      error: "Не удалось загрузить изображение"
    };
  }

  if (kind === "video_note") {
    return {
      title: "Видео кружок",
      loading: "Видео загружается",
      failed: "Видео недоступно",
      loadingActive: "Загружаем видео",
      error: "Не удалось загрузить видео"
    };
  }

  if (kind === "video") {
    return {
      title: "Видео",
      loading: "Видео загружается",
      failed: "Видео недоступно",
      loadingActive: "Загружаем видео",
      error: "Не удалось загрузить видео"
    };
  }

  return {
    title: "Голосовое сообщение",
    loading: "Голос загружается",
    failed: "Голосовое сообщение недоступно",
    loadingActive: "Загружаем аудио",
    error: "Не удалось загрузить аудио"
  };
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
