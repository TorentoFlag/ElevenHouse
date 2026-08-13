import type { Session, SessionMessage } from "@elevenhouse/contracts/sessions";
import { RemoteParticipant, Room, RoomEvent, Track, type TrackPublication } from "livekit-client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import { createSessionPageModel, type SessionWebLocale } from "./sessionPageModel.js";
import type { SessionApi } from "./sessionApi.js";

export type VideoSessionExperienceProps = {
  readonly api: SessionApi;
  readonly locale: SessionWebLocale;
  readonly sessionId: string;
  readonly onExit: () => void;
};

type CallStatus = "loading" | "prejoin" | "connecting" | "connected" | "reconnecting" | "error";

export function VideoSessionExperience(props: VideoSessionExperienceProps) {
  const copy = useMemo(() => getCopy(props.locale), [props.locale]);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<readonly SessionMessage[]>([]);
  const [status, setStatus] = useState<CallStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [roomRevision, setRoomRevision] = useState(0);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endConfirmationOpen, setEndConfirmationOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const roomRef = useRef<Room | null>(null);

  const refreshSession = useCallback(async () => {
    const response = await props.api.session(props.sessionId);
    setSession(response.session);
    return response.session;
  }, [props.api, props.sessionId]);

  const refreshMessages = useCallback(async () => {
    let afterSequence: string | null = "0";
    const pageMessages: SessionMessage[] = [];
    while (afterSequence !== null) {
      const response = await props.api.messages(props.sessionId, afterSequence);
      pageMessages.push(...response.messages);
      afterSequence = response.nextAfterSequence;
    }
    setMessages((current) => mergeMessages(current, pageMessages));
  }, [props.api, props.sessionId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([refreshSession(), refreshMessages()])
      .then(() => {
        if (!cancelled) setStatus("prejoin");
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(readError(cause, copy.loadError));
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [copy.loadError, refreshMessages, refreshSession]);

  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(() => {
      void Promise.all([refreshSession(), refreshMessages()])
        .then(() => setError(null))
        .catch((cause: unknown) => setError(readError(cause, copy.loadError)));
    }, 2_500);
    return () => window.clearInterval(interval);
  }, [copy.loadError, refreshMessages, refreshSession, session]);

  useEffect(() => {
    if (status !== "connected" && status !== "reconnecting") return;
    const interval = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1_000);
    return () => window.clearInterval(interval);
  }, [status]);

  useEffect(
    () => () => {
      roomRef.current?.disconnect(true);
      roomRef.current = null;
    },
    []
  );

  const join = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    try {
      const credential = await props.api.join(props.sessionId);
      const nextRoom = new Room({ adaptiveStream: true, dynacast: true });
      const updateRoom = () => setRoomRevision((value) => value + 1);
      nextRoom
        .on(RoomEvent.ParticipantConnected, updateRoom)
        .on(RoomEvent.ParticipantDisconnected, updateRoom)
        .on(RoomEvent.TrackSubscribed, updateRoom)
        .on(RoomEvent.TrackUnsubscribed, updateRoom)
        .on(RoomEvent.TrackMuted, updateRoom)
        .on(RoomEvent.TrackUnmuted, updateRoom)
        .on(RoomEvent.Reconnecting, () => setStatus("reconnecting"))
        .on(RoomEvent.Reconnected, () => setStatus("connected"))
        .on(RoomEvent.Disconnected, () => setStatus("prejoin"));
      await nextRoom.connect(credential.serverUrl, credential.participantToken);
      roomRef.current = nextRoom;
      setRoom(nextRoom);
      setStatus("connected");
      void Promise.all([
        nextRoom.localParticipant.setMicrophoneEnabled(microphoneEnabled),
        nextRoom.localParticipant.setCameraEnabled(cameraEnabled)
      ])
        .then(updateRoom)
        .catch((cause: unknown) => {
          setError(readError(cause, copy.joinError));
          updateRoom();
        });
      void refreshSession();
    } catch (cause: unknown) {
      roomRef.current?.disconnect(true);
      roomRef.current = null;
      setRoom(null);
      setError(readError(cause, copy.joinError));
      setStatus("error");
    }
  }, [
    cameraEnabled,
    copy.joinError,
    microphoneEnabled,
    props.api,
    props.sessionId,
    refreshSession
  ]);

  const toggleMicrophone = useCallback(async () => {
    const next = !microphoneEnabled;
    setMicrophoneEnabled(next);
    await room?.localParticipant.setMicrophoneEnabled(next);
    setRoomRevision((value) => value + 1);
  }, [microphoneEnabled, room]);

  const toggleCamera = useCallback(async () => {
    const next = !cameraEnabled;
    setCameraEnabled(next);
    await room?.localParticipant.setCameraEnabled(next);
    setRoomRevision((value) => value + 1);
  }, [cameraEnabled, room]);

  const toggleScreenShare = useCallback(async () => {
    if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(
        !room.localParticipant.isScreenShareEnabled
      );
      setRoomRevision((value) => value + 1);
    } catch (cause: unknown) {
      setError(readError(cause, copy.screenError));
    }
  }, [copy.screenError, room]);

  const leave = useCallback(() => {
    roomRef.current?.disconnect(true);
    roomRef.current = null;
    props.onExit();
  }, [props]);

  const endForEveryone = useCallback(async () => {
    if (!session || session.currentParticipantRole !== "astrologer") return;
    setEnding(true);
    try {
      await props.api.end(props.sessionId, { operationId: crypto.randomUUID() });
      roomRef.current?.disconnect(true);
      props.onExit();
    } catch (cause: unknown) {
      setError(readError(cause, copy.endError));
      setEndConfirmationOpen(false);
    } finally {
      setEnding(false);
    }
  }, [copy.endError, props, session]);

  const sendMessage = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = draft.trim();
      if (!text || sending) return;
      setSending(true);
      try {
        const response = await props.api.sendMessage(props.sessionId, {
          operationId: crypto.randomUUID(),
          text
        });
        setMessages((current) => mergeMessages(current, [response.message]));
        setDraft("");
      } catch (cause: unknown) {
        setError(readError(cause, copy.messageError));
      } finally {
        setSending(false);
      }
    },
    [copy.messageError, draft, props.api, props.sessionId, sending]
  );

  const model = session
    ? createSessionPageModel({
        locale: props.locale,
        state: session.state,
        joinPolicy: session.joinPolicy
      })
    : null;
  const remoteParticipant = room ? ([...room.remoteParticipants.values()][0] ?? null) : null;
  const remoteScreen = remoteParticipant?.getTrackPublication(Track.Source.ScreenShare) ?? null;
  const remoteCamera = remoteParticipant?.getTrackPublication(Track.Source.Camera) ?? null;
  const localCamera = room?.localParticipant.getTrackPublication(Track.Source.Camera) ?? null;
  const localScreen = room?.localParticipant.getTrackPublication(Track.Source.ScreenShare) ?? null;
  const connected = status === "connected" || status === "reconnecting";
  const screenShareSupported =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function";

  return (
    <main className="ehSession" aria-label={copy.pageLabel} data-room-revision={roomRevision}>
      <header className="ehSession__header">
        <button
          className="ehSession__back"
          type="button"
          onClick={leave}
          aria-label={copy.backLabel}
        >
          ←
        </button>
        <div className="ehSession__title">
          <strong>{session?.productTitle ?? copy.loading}</strong>
          <span>{connected ? formatDuration(elapsedSeconds) : copy.prejoin}</span>
        </div>
        <span className="ehSession__privacy">
          <span aria-hidden="true">●</span>
          {model?.recordingLabel ?? copy.notRecorded}
        </span>
      </header>

      <section className="ehSession__stage" aria-live="polite">
        {connected ? (
          <>
            <MediaTile
              publication={(remoteScreen ?? remoteCamera) as TrackPublication | null}
              fallback={<ParticipantFallback name={otherParticipantName(session, copy.guest)} />}
              className="ehSession__remote"
            />
            <MediaTile
              publication={(localScreen ?? localCamera) as TrackPublication | null}
              fallback={<ParticipantFallback name={copy.you} />}
              className="ehSession__local"
              muted
            />
            {remoteParticipant ? (
              <ParticipantAudio participant={remoteParticipant} revision={roomRevision} />
            ) : null}
            {!remoteParticipant ? <div className="ehSession__waiting">{copy.waiting}</div> : null}
          </>
        ) : (
          <Prejoin
            copy={copy}
            error={error}
            model={model}
            status={status}
            cameraEnabled={cameraEnabled}
            microphoneEnabled={microphoneEnabled}
            onCamera={() => setCameraEnabled((value) => !value)}
            onMicrophone={() => setMicrophoneEnabled((value) => !value)}
            onJoin={() => void join()}
            onRetry={() => {
              setStatus("loading");
              setError(null);
              void refreshSession()
                .then(() => setStatus("prejoin"))
                .catch((cause) => {
                  setError(readError(cause, copy.loadError));
                  setStatus("error");
                });
            }}
          />
        )}
      </section>

      <aside
        className={chatOpen ? "ehSession__chat ehSession__chat--open" : "ehSession__chat"}
        aria-label={copy.chatLabel}
      >
        <div className="ehSession__chatHeader">
          <strong>{copy.chatLabel}</strong>
          <button type="button" onClick={() => setChatOpen(false)} aria-label={copy.closeChat}>
            ×
          </button>
        </div>
        <ol className="ehSession__messages" aria-live="polite">
          {messages.length === 0 ? <li className="ehSession__empty">{copy.noMessages}</li> : null}
          {messages.map((message) => (
            <li
              key={message.id}
              className={
                message.senderRole === session?.currentParticipantRole
                  ? "ehSession__message ehSession__message--own"
                  : "ehSession__message"
              }
            >
              <span>{message.text}</span>
              <time dateTime={message.createdAt}>
                {formatTime(message.createdAt, props.locale)}
              </time>
            </li>
          ))}
        </ol>
        <form className="ehSession__composer" onSubmit={(event) => void sendMessage(event)}>
          <label className="ehSession__srOnly" htmlFor="eh-session-message">
            {copy.messageLabel}
          </label>
          <textarea
            id="eh-session-message"
            value={draft}
            maxLength={4_000}
            rows={2}
            placeholder={copy.messagePlaceholder}
            onChange={(event) => setDraft(event.target.value)}
            disabled={!session || sending}
          />
          <button type="submit" disabled={!draft.trim() || sending} aria-label={copy.send}>
            ➤
          </button>
        </form>
      </aside>

      {connected ? (
        <footer className="ehSession__controls" aria-label={copy.controlsLabel}>
          <Control
            active={microphoneEnabled}
            label={microphoneEnabled ? copy.mute : copy.unmute}
            icon={microphoneEnabled ? "🎙" : "🔇"}
            onClick={() => void toggleMicrophone()}
          />
          <Control
            active={cameraEnabled}
            label={cameraEnabled ? copy.cameraOff : copy.cameraOn}
            icon={cameraEnabled ? "▣" : "▢"}
            onClick={() => void toggleCamera()}
          />
          {screenShareSupported ? (
            <Control
              active={room?.localParticipant.isScreenShareEnabled ?? false}
              label={copy.screenShare}
              icon="▤"
              onClick={() => void toggleScreenShare()}
            />
          ) : null}
          <Control
            active={chatOpen}
            label={copy.chatLabel}
            icon="◧"
            onClick={() => setChatOpen((value) => !value)}
          />
          <button
            className="ehSession__hangup"
            type="button"
            onClick={leave}
            aria-label={model?.leaveLabel ?? copy.leave}
          >
            ✕
          </button>
          {session?.currentParticipantRole === "astrologer" ? (
            <button
              className="ehSession__end"
              type="button"
              onClick={() => setEndConfirmationOpen(true)}
            >
              {model?.endLabel}
            </button>
          ) : null}
        </footer>
      ) : null}
      {endConfirmationOpen ? (
        <div className="ehSession__dialogBackdrop">
          <section
            className="ehSession__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="eh-session-end-title"
          >
            <h2 id="eh-session-end-title">{copy.endConfirmTitle}</h2>
            <p>{copy.endConfirmText}</p>
            <div>
              <button type="button" disabled={ending} onClick={() => setEndConfirmationOpen(false)}>
                {copy.cancel}
              </button>
              <button type="button" disabled={ending} onClick={() => void endForEveryone()}>
                {ending ? copy.ending : copy.endConfirmAction}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {connected && error ? (
        <div className="ehSession__toast" role="alert">
          {error}
        </div>
      ) : null}
    </main>
  );
}

function Prejoin(props: {
  readonly copy: ReturnType<typeof getCopy>;
  readonly model: ReturnType<typeof createSessionPageModel> | null;
  readonly status: CallStatus;
  readonly error: string | null;
  readonly cameraEnabled: boolean;
  readonly microphoneEnabled: boolean;
  readonly onCamera: () => void;
  readonly onMicrophone: () => void;
  readonly onJoin: () => void;
  readonly onRetry: () => void;
}) {
  const disabled =
    props.status === "loading" || props.status === "connecting" || !props.model?.canJoin;
  return (
    <div className="ehSession__prejoin">
      <div className="ehSession__prejoinAvatar" aria-hidden="true">
        ☾
      </div>
      <h1>{props.copy.readyTitle}</h1>
      <p>{props.status === "connecting" ? props.copy.connecting : props.copy.readyText}</p>
      {props.model?.joinableAt ? (
        <p className="ehSession__joinTime">
          {props.copy.availableAt} {formatTime(props.model.joinableAt, props.copy.locale)}
        </p>
      ) : null}
      {props.error ? (
        <p role="alert" className="ehSession__prejoinError">
          {props.error}
        </p>
      ) : null}
      <div className="ehSession__deviceControls">
        <Control
          active={props.microphoneEnabled}
          label={props.microphoneEnabled ? props.copy.mute : props.copy.unmute}
          icon={props.microphoneEnabled ? "🎙" : "🔇"}
          onClick={props.onMicrophone}
        />
        <Control
          active={props.cameraEnabled}
          label={props.cameraEnabled ? props.copy.cameraOff : props.copy.cameraOn}
          icon={props.cameraEnabled ? "▣" : "▢"}
          onClick={props.onCamera}
        />
      </div>
      <button className="ehSession__join" type="button" disabled={disabled} onClick={props.onJoin}>
        {props.model?.joinLabel ?? props.copy.join}
      </button>
      {props.status === "error" ? (
        <button className="ehSession__retry" type="button" onClick={props.onRetry}>
          {props.copy.retry}
        </button>
      ) : null}
      <small>{props.model?.recordingLabel ?? props.copy.notRecorded}</small>
    </div>
  );
}

function Control(props: {
  readonly active: boolean;
  readonly label: string;
  readonly icon: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      className={
        props.active ? "ehSession__control ehSession__control--active" : "ehSession__control"
      }
      type="button"
      aria-pressed={props.active}
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
    >
      {props.icon}
    </button>
  );
}

function MediaTile(props: {
  readonly publication: TrackPublication | null;
  readonly fallback: ReactNode;
  readonly className: string;
  readonly muted?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const track = props.publication?.track;
    const host = hostRef.current;
    if (!track || !host) return;
    const element = track.attach();
    if (element instanceof HTMLMediaElement) element.muted = props.muted ?? false;
    host.replaceChildren(element);
    return () => {
      track.detach(element);
      element.remove();
    };
  }, [props.muted, props.publication]);
  return (
    <div ref={hostRef} className={props.className}>
      {props.publication?.track ? null : props.fallback}
    </div>
  );
}

function ParticipantAudio({
  participant,
  revision
}: {
  readonly participant: RemoteParticipant;
  readonly revision: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const tracks = [...participant.audioTrackPublications.values()].flatMap((publication) =>
      publication.track ? [publication.track] : []
    );
    const elements = tracks.map((track) => track.attach());
    host.replaceChildren(...elements);
    return () =>
      tracks.forEach((track, index) => {
        const element = elements[index];
        if (element) track.detach(element);
      });
  }, [participant, revision]);
  return <div ref={hostRef} hidden />;
}

function ParticipantFallback({ name }: { readonly name: string }) {
  return (
    <div className="ehSession__participantFallback">
      <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
      <strong>{name}</strong>
    </div>
  );
}

function mergeMessages(
  current: readonly SessionMessage[],
  incoming: readonly SessionMessage[]
): readonly SessionMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((left, right) =>
    Number(BigInt(left.sequence) - BigInt(right.sequence))
  );
}

function otherParticipantName(session: Session | null, fallback: string): string {
  return (
    session?.participants.find((participant) => participant.role !== session.currentParticipantRole)
      ?.displayName ?? fallback
  );
}

function formatTime(instant: string, locale: SessionWebLocale): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(instant)
  );
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((value) => String(value).padStart(2, "0")).join(":");
}

function readError(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function getCopy(locale: SessionWebLocale) {
  if (locale === "en")
    return {
      locale,
      pageLabel: "Video session",
      backLabel: "Back",
      loading: "Loading session",
      prejoin: "Waiting room",
      notRecorded: "Not recorded",
      loadError: "Could not load the session.",
      joinError: "Could not join the call.",
      screenError: "Could not start screen sharing.",
      endError: "Could not end the session.",
      messageError: "Could not send the message.",
      chatLabel: "Chat",
      closeChat: "Close chat",
      noMessages: "Messages will appear here.",
      messageLabel: "Message",
      messagePlaceholder: "Write a message…",
      send: "Send",
      controlsLabel: "Call controls",
      mute: "Mute microphone",
      unmute: "Turn on microphone",
      cameraOff: "Turn off camera",
      cameraOn: "Turn on camera",
      screenShare: "Share screen",
      leave: "Leave",
      waiting: "Waiting for the other participant…",
      guest: "Participant",
      you: "You",
      readyTitle: "Ready to join?",
      readyText: "Check your microphone and camera before entering.",
      connecting: "Connecting securely…",
      availableAt: "You can join at",
      join: "Join session",
      retry: "Try again",
      endConfirmTitle: "End the session for everyone?",
      endConfirmText:
        "The call will end for both participants. Chat history will remain available.",
      endConfirmAction: "End session",
      ending: "Ending…",
      cancel: "Cancel"
    } as const;
  return {
    locale,
    pageLabel: "Видеосессия",
    backLabel: "Назад",
    loading: "Загружаем сессию",
    prejoin: "Комната ожидания",
    notRecorded: "Без записи",
    loadError: "Не удалось загрузить сессию.",
    joinError: "Не удалось войти в звонок.",
    screenError: "Не удалось включить демонстрацию экрана.",
    endError: "Не удалось завершить сессию.",
    messageError: "Не удалось отправить сообщение.",
    chatLabel: "Чат",
    closeChat: "Закрыть чат",
    noMessages: "Сообщения появятся здесь.",
    messageLabel: "Сообщение",
    messagePlaceholder: "Напишите сообщение…",
    send: "Отправить",
    controlsLabel: "Управление звонком",
    mute: "Выключить микрофон",
    unmute: "Включить микрофон",
    cameraOff: "Выключить камеру",
    cameraOn: "Включить камеру",
    screenShare: "Показать экран",
    leave: "Выйти",
    waiting: "Ждём второго участника…",
    guest: "Участник",
    you: "Вы",
    readyTitle: "Готовы войти?",
    readyText: "Проверьте микрофон и камеру перед входом.",
    connecting: "Подключаемся к защищённой комнате…",
    availableAt: "Вход откроется в",
    join: "Войти в сессию",
    retry: "Повторить",
    endConfirmTitle: "Завершить сессию для всех?",
    endConfirmText: "Звонок завершится у обоих участников. История чата останется доступна.",
    endConfirmAction: "Завершить сессию",
    ending: "Завершаем…",
    cancel: "Отмена"
  } as const;
}
