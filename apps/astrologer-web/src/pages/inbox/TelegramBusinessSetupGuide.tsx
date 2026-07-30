import type { MessagingChannelConnection } from "@elevenhouse/contracts";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  isTelegramMtprotoPhoneStepSubmittable,
  type TelegramMtprotoWizardStep
} from "../../features/messaging/model/telegramMtprotoConnectionWizard";
import styles from "./InboxPage.module.css";

export type ChannelConnectionDialogProps = {
  readonly connection: MessagingChannelConnection | undefined;
  readonly mtprotoConnection: MessagingChannelConnection | undefined;
  readonly instagramConnection: MessagingChannelConnection | undefined;
  readonly isStarting: boolean;
  readonly errorMessage: string | null;
  readonly isStartingInstagramGraph: boolean;
  readonly instagramGraphErrorMessage: string | null;
  readonly telegramBotUsername: string | null;
  readonly telegramBotUrl: string | null;
  readonly mtprotoStep: TelegramMtprotoWizardStep;
  readonly mtprotoPhoneNumber: string;
  readonly mtprotoCode: string;
  readonly mtprotoPassword: string;
  readonly mtprotoMaskedPhoneNumber: string | null;
  readonly mtprotoRetryAfterSeconds: number | null;
  readonly isMtprotoConsentAccepted: boolean;
  readonly isStartingMtproto: boolean;
  readonly isSubmittingMtprotoCode: boolean;
  readonly isSubmittingMtprotoPassword: boolean;
  readonly mtprotoErrorMessage: string | null;
  readonly onStartConnection: () => void;
  readonly onStartInstagramGraphConnection: () => void;
  readonly onMtprotoPhoneNumberChange: (value: string) => void;
  readonly onMtprotoConsentAcceptedChange: (value: boolean) => void;
  readonly onMtprotoCodeChange: (value: string) => void;
  readonly onMtprotoPasswordChange: (value: string) => void;
  readonly onStartMtprotoConnection: () => void;
  readonly onSubmitMtprotoCode: () => void;
  readonly onSubmitMtprotoPassword: () => void;
  readonly onResetMtprotoConnection: () => void;
  readonly onClose: () => void;
};

type ChannelConnectionStep =
  | "channels"
  | "telegram-methods"
  | "telegram-business"
  | "telegram-mtproto"
  | "instagram-graph";
type TelegramGuideStepId = 1 | 2 | 3 | 4 | 5;

export function ChannelConnectionDialog({
  connection,
  mtprotoConnection,
  instagramConnection,
  isStarting,
  errorMessage,
  isStartingInstagramGraph,
  instagramGraphErrorMessage,
  telegramBotUsername,
  telegramBotUrl,
  mtprotoStep,
  mtprotoPhoneNumber,
  mtprotoCode,
  mtprotoPassword,
  mtprotoMaskedPhoneNumber,
  mtprotoRetryAfterSeconds,
  isMtprotoConsentAccepted,
  isStartingMtproto,
  isSubmittingMtprotoCode,
  isSubmittingMtprotoPassword,
  mtprotoErrorMessage,
  onStartConnection,
  onStartInstagramGraphConnection,
  onMtprotoPhoneNumberChange,
  onMtprotoConsentAcceptedChange,
  onMtprotoCodeChange,
  onMtprotoPasswordChange,
  onStartMtprotoConnection,
  onSubmitMtprotoCode,
  onSubmitMtprotoPassword,
  onResetMtprotoConnection,
  onClose
}: ChannelConnectionDialogProps) {
  const [step, setStep] = useState<ChannelConnectionStep>("channels");
  const botHandle = telegramBotUsername ? `@${telegramBotUsername}` : null;
  const isActive = connection?.status === "active";
  const needsAttention =
    connection?.status === "reauth_required" ||
    connection?.status === "revoked" ||
    connection?.status === "error";

  const dialog = (
    <div className={styles.channelSetupOverlay} role="presentation" onMouseDown={onClose}>
      <section
        className={
          step === "telegram-business" || step === "telegram-mtproto" || step === "instagram-graph"
            ? styles.telegramGuideDialog
            : styles.channelSetupDialog
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId(step)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {step === "channels" ? (
          <ChannelSelection
            connection={connection}
            instagramConnection={instagramConnection}
            onClose={onClose}
            onSelectInstagram={() => setStep("instagram-graph")}
            onSelectTelegram={() => setStep("telegram-methods")}
          />
        ) : null}
        {step === "telegram-methods" ? (
          <TelegramMethodSelection
            connection={connection}
            onBack={() => setStep("channels")}
            onClose={onClose}
            onSelectBusiness={() => setStep("telegram-business")}
          />
        ) : null}
        {step === "telegram-business" ? (
          <TelegramBusinessGuide
            botHandle={botHandle}
            connection={connection}
            errorMessage={errorMessage}
            isActive={isActive}
            isStarting={isStarting}
            needsAttention={needsAttention}
            botUrl={telegramBotUrl}
            onBack={() => setStep("telegram-methods")}
            onClose={onClose}
            onStartConnection={onStartConnection}
          />
        ) : null}
        {step === "telegram-mtproto" ? (
          <TelegramMtprotoGuide
            connection={mtprotoConnection}
            errorMessage={mtprotoErrorMessage}
            isConsentAccepted={isMtprotoConsentAccepted}
            isStarting={isStartingMtproto}
            isSubmittingCode={isSubmittingMtprotoCode}
            isSubmittingPassword={isSubmittingMtprotoPassword}
            maskedPhoneNumber={mtprotoMaskedPhoneNumber}
            password={mtprotoPassword}
            phoneNumber={mtprotoPhoneNumber}
            code={mtprotoCode}
            retryAfterSeconds={mtprotoRetryAfterSeconds}
            step={mtprotoStep}
            onBack={() => setStep("telegram-methods")}
            onClose={onClose}
            onCodeChange={onMtprotoCodeChange}
            onConsentAcceptedChange={onMtprotoConsentAcceptedChange}
            onPasswordChange={onMtprotoPasswordChange}
            onPhoneNumberChange={onMtprotoPhoneNumberChange}
            onReset={onResetMtprotoConnection}
            onStartConnection={onStartMtprotoConnection}
            onSubmitCode={onSubmitMtprotoCode}
            onSubmitPassword={onSubmitMtprotoPassword}
          />
        ) : null}
        {step === "instagram-graph" ? (
          <InstagramGraphGuide
            connection={instagramConnection}
            errorMessage={instagramGraphErrorMessage}
            isStarting={isStartingInstagramGraph}
            onBack={() => setStep("channels")}
            onClose={onClose}
            onStartConnection={onStartInstagramGraphConnection}
          />
        ) : null}
      </section>
    </div>
  );

  if (typeof document === "undefined") {
    return dialog;
  }

  return createPortal(dialog, document.body);
}

function ChannelSelection({
  connection,
  instagramConnection,
  onClose,
  onSelectInstagram,
  onSelectTelegram
}: {
  readonly connection: MessagingChannelConnection | undefined;
  readonly instagramConnection: MessagingChannelConnection | undefined;
  readonly onClose: () => void;
  readonly onSelectInstagram: () => void;
  readonly onSelectTelegram: () => void;
}) {
  return (
    <>
      <header className={styles.channelSetupHeader}>
        <div>
          <h2 id="channel-connection-title">Каналы</h2>
          <p>Подключите канал, через который клиенты будут писать вам.</p>
        </div>
        <button
          className={styles.channelSetupClose}
          type="button"
          aria-label="Закрыть выбор канала"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className={styles.channelSetupList}>
        <button
          className={styles.channelSetupRow}
          type="button"
          aria-label="Выбрать Telegram"
          onClick={onSelectTelegram}
        >
          <span className={styles.channelSetupBadgeTelegram}>T</span>
          <span className={styles.channelSetupRowText}>
            <strong>Telegram</strong>
            <span>{telegramChannelStatusText(connection)}</span>
          </span>
          <span className={styles.channelSetupRowAction}>Выбрать</span>
        </button>
        <button
          className={styles.channelSetupRow}
          type="button"
          aria-label="Выбрать Instagram"
          onClick={onSelectInstagram}
        >
          <span className={styles.channelSetupBadgeInstagram}>I</span>
          <span className={styles.channelSetupRowText}>
            <strong>Instagram</strong>
            <span>{instagramChannelStatusText(instagramConnection)}</span>
          </span>
          <span className={styles.channelSetupRowAction}>Выбрать</span>
        </button>
      </div>
    </>
  );
}

function TelegramMethodSelection({
  connection,
  onBack,
  onClose,
  onSelectBusiness
}: {
  readonly connection: MessagingChannelConnection | undefined;
  readonly onBack: () => void;
  readonly onClose: () => void;
  readonly onSelectBusiness: () => void;
}) {
  return (
    <>
      <header className={styles.channelSetupHeader}>
        <div>
          <button className={styles.channelSetupBack} type="button" onClick={onBack}>
            Каналы
          </button>
          <h2 id="telegram-method-title">Telegram</h2>
          <p>Выберите способ, которым ElevenHouse будет получать и отправлять сообщения.</p>
        </div>
        <button
          className={styles.channelSetupClose}
          type="button"
          aria-label="Закрыть выбор метода"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className={styles.telegramMethodGrid}>
        <button
          className={styles.telegramMethodCard}
          type="button"
          aria-label="Настроить Telegram Business"
          onClick={onSelectBusiness}
        >
          <span className={styles.channelSetupBadgeTelegram}>T</span>
          <span>
            <strong>Telegram Business / Secretary bot</strong>
            <span>Подключение через официальный Business-бот. Сейчас доступно.</span>
            <em>{telegramBusinessMethodStatusText(connection)}</em>
          </span>
        </button>
        <button
          className={styles.telegramMethodCard}
          type="button"
          aria-label="Telegram Account скоро"
          disabled
        >
          <span className={styles.channelSetupBadgeTelegramMuted}>T</span>
          <span>
            <strong>Telegram Account / MTProto</strong>
            <span>Подключение личного Telegram аккаунта через код входа.</span>
            <em>Будет доступно позже</em>
          </span>
        </button>
      </div>
    </>
  );
}

function TelegramMtprotoGuide({
  connection,
  errorMessage,
  isConsentAccepted,
  isStarting,
  isSubmittingCode,
  isSubmittingPassword,
  maskedPhoneNumber,
  password,
  phoneNumber,
  code,
  retryAfterSeconds,
  step,
  onBack,
  onClose,
  onCodeChange,
  onConsentAcceptedChange,
  onPasswordChange,
  onPhoneNumberChange,
  onReset,
  onStartConnection,
  onSubmitCode,
  onSubmitPassword
}: {
  readonly connection: MessagingChannelConnection | undefined;
  readonly errorMessage: string | null;
  readonly isConsentAccepted: boolean;
  readonly isStarting: boolean;
  readonly isSubmittingCode: boolean;
  readonly isSubmittingPassword: boolean;
  readonly maskedPhoneNumber: string | null;
  readonly password: string;
  readonly phoneNumber: string;
  readonly code: string;
  readonly retryAfterSeconds: number | null;
  readonly step: TelegramMtprotoWizardStep;
  readonly onBack: () => void;
  readonly onClose: () => void;
  readonly onCodeChange: (value: string) => void;
  readonly onConsentAcceptedChange: (value: boolean) => void;
  readonly onPasswordChange: (value: string) => void;
  readonly onPhoneNumberChange: (value: string) => void;
  readonly onReset: () => void;
  readonly onStartConnection: () => void;
  readonly onSubmitCode: () => void;
  readonly onSubmitPassword: () => void;
}) {
  const isActive = connection?.status === "active" || step === "connected";
  const canStart = isTelegramMtprotoPhoneStepSubmittable(phoneNumber, isConsentAccepted);
  const statusText = telegramMtprotoStatusText({
    connection,
    isActive,
    maskedPhoneNumber,
    retryAfterSeconds,
    step
  });

  return (
    <>
      <header className={styles.telegramGuideHeader}>
        <div>
          <button className={styles.channelSetupBack} type="button" onClick={onBack}>
            Telegram
          </button>
          <span className={styles.telegramGuideKicker}>Telegram Account</span>
          <h2 id="telegram-mtproto-guide-title">Подключить Telegram Account</h2>
          <p>Подключите личный Telegram аккаунт через код входа и optional 2FA пароль.</p>
        </div>
        <button
          className={styles.telegramGuideClose}
          type="button"
          aria-label="Закрыть подключение Telegram Account"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className={styles.telegramMtprotoBody}>
        <div className={styles.telegramGuideStatus} data-attention={errorMessage || undefined}>
          <span>{telegramMtprotoStatusLabel(step, isActive)}</span>
          <strong>{statusText}</strong>
        </div>

        {errorMessage ? (
          <p className={styles.telegramGuideError} role="alert">
            {errorMessage}
          </p>
        ) : null}

        <section className={styles.telegramMtprotoNotice}>
          <strong>MTProto подключает ElevenHouse как новый Telegram-клиент.</strong>
          <p>
            Используйте этот способ только если вы осознанно даёте доступ к личному аккаунту
            астролога. Session хранится на backend в зашифрованном виде.
          </p>
        </section>

        {step === "phone" ? (
          <form
            className={styles.telegramMtprotoForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (canStart && !isStarting) {
                onStartConnection();
              }
            }}
          >
            <label>
              <span>Номер телефона Telegram</span>
              <input
                id="telegram-mtproto-phone-number"
                name="telegramMtprotoPhoneNumber"
                value={phoneNumber}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7 800 555 35 35"
                disabled={isStarting}
                onChange={(event) => onPhoneNumberChange(event.currentTarget.value)}
              />
            </label>
            <label className={styles.telegramMtprotoConsent}>
              <input
                type="checkbox"
                checked={isConsentAccepted}
                disabled={isStarting}
                onChange={(event) => onConsentAcceptedChange(event.currentTarget.checked)}
              />
              <span>
                Я понимаю, что ElevenHouse подключится к Telegram аккаунту как отдельный клиент.
              </span>
            </label>
            <button
              className={styles.telegramGuidePrimary}
              type="submit"
              disabled={!canStart || isStarting}
            >
              {isStarting ? "Отправляем код" : "Получить код"}
            </button>
          </form>
        ) : null}

        {step === "code" ? (
          <form
            className={styles.telegramMtprotoForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (code.trim() && !isSubmittingCode) {
                onSubmitCode();
              }
            }}
          >
            <div className={styles.telegramMtprotoStepCopy}>
              <h3>Введите код из Telegram</h3>
              <p>{maskedPhoneNumber ?? "Код отправлен в Telegram аккаунт."}</p>
            </div>
            <label>
              <span>Код Telegram</span>
              <input
                id="telegram-mtproto-code"
                name="telegramMtprotoCode"
                value={code}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="777777"
                disabled={isSubmittingCode}
                onChange={(event) => onCodeChange(event.currentTarget.value)}
              />
            </label>
            <button
              className={styles.telegramGuidePrimary}
              type="submit"
              disabled={!code.trim() || isSubmittingCode}
            >
              {isSubmittingCode ? "Проверяем код" : "Подтвердить код"}
            </button>
          </form>
        ) : null}

        {step === "password" ? (
          <form
            className={styles.telegramMtprotoForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (password && !isSubmittingPassword) {
                onSubmitPassword();
              }
            }}
          >
            <div className={styles.telegramMtprotoStepCopy}>
              <h3>Введите пароль 2FA</h3>
              <p>Telegram запросил cloud password для аккаунта {maskedPhoneNumber ?? ""}.</p>
            </div>
            <label>
              <span>Пароль 2FA</span>
              <input
                id="telegram-mtproto-password"
                name="telegramMtprotoPassword"
                value={password}
                type="password"
                autoComplete="current-password"
                disabled={isSubmittingPassword}
                onChange={(event) => onPasswordChange(event.currentTarget.value)}
              />
            </label>
            <button
              className={styles.telegramGuidePrimary}
              type="submit"
              disabled={!password || isSubmittingPassword}
            >
              {isSubmittingPassword ? "Подключаем" : "Завершить подключение"}
            </button>
          </form>
        ) : null}

        {step === "connected" ? (
          <div className={styles.telegramGuideActionStatus} role="status">
            <span>Канал подключён</span>
            <strong>Telegram Account готов к работе</strong>
          </div>
        ) : null}

        {step !== "phone" && step !== "connected" ? (
          <button className={styles.telegramMtprotoSecondary} type="button" onClick={onReset}>
            Изменить номер
          </button>
        ) : null}
      </div>
    </>
  );
}

function InstagramGraphGuide({
  connection,
  errorMessage,
  isStarting,
  onBack,
  onClose,
  onStartConnection
}: {
  readonly connection: MessagingChannelConnection | undefined;
  readonly errorMessage: string | null;
  readonly isStarting: boolean;
  readonly onBack: () => void;
  readonly onClose: () => void;
  readonly onStartConnection: () => void;
}) {
  const isActive = connection?.status === "active";
  const needsAttention =
    connection?.status === "reauth_required" ||
    connection?.status === "revoked" ||
    connection?.status === "error";

  return (
    <>
      <header className={styles.telegramGuideHeader}>
        <div>
          <button className={styles.channelSetupBack} type="button" onClick={onBack}>
            Каналы
          </button>
          <span className={styles.telegramGuideKicker}>Instagram</span>
          <h2 id="instagram-graph-guide-title">Подключить Instagram</h2>
          <p>Подключите профессиональный Instagram аккаунт через Meta Business Login.</p>
        </div>
        <button
          className={styles.telegramGuideClose}
          type="button"
          aria-label="Закрыть подключение Instagram"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className={styles.telegramMtprotoBody}>
        <div className={styles.telegramGuideStatus} data-attention={needsAttention || undefined}>
          <span>{instagramGraphStatusLabel(connection, isStarting)}</span>
          <strong>{instagramGraphStatusText(connection)}</strong>
        </div>

        {errorMessage ? (
          <p className={styles.telegramGuideError} role="alert">
            {errorMessage}
          </p>
        ) : null}

        <section className={styles.telegramMtprotoNotice}>
          <strong>Instagram подключается через официальный Instagram Login.</strong>
          <p>
            После перехода в Instagram выберите профессиональный аккаунт и подтвердите права на
            сообщения.
          </p>
        </section>

        {isActive ? (
          <div className={styles.telegramGuideActionStatus} role="status">
            <span>Канал подключён</span>
            <strong>Instagram готов к работе</strong>
          </div>
        ) : (
          <button
            className={styles.telegramGuidePrimary}
            type="button"
            disabled={isStarting}
            onClick={() => onStartConnection()}
          >
            {isStarting ? "Открываем Meta" : "Продолжить в Meta"}
          </button>
        )}
      </div>
    </>
  );
}

function TelegramBusinessGuide({
  botHandle,
  botUrl,
  connection,
  errorMessage,
  isActive,
  isStarting,
  needsAttention,
  onBack,
  onClose,
  onStartConnection
}: {
  readonly botHandle: string | null;
  readonly botUrl: string | null;
  readonly connection: MessagingChannelConnection | undefined;
  readonly errorMessage: string | null;
  readonly isActive: boolean;
  readonly isStarting: boolean;
  readonly needsAttention: boolean;
  readonly onBack: () => void;
  readonly onClose: () => void;
  readonly onStartConnection: () => void;
}) {
  const activeStep = telegramBusinessActiveStep(connection, botHandle);
  const hasPreparedConnection = Boolean(botHandle) || isActive;
  const startButtonLabel =
    connection?.status === "connecting" ? "Показать username бота" : "Создать подключение";
  const [selectedStep, setSelectedStep] = useState<TelegramGuideStepId>(activeStep);
  const selectedStepCopy = telegramGuideStepCopy(selectedStep, botHandle);

  useEffect(() => {
    setSelectedStep(activeStep);
  }, [activeStep]);

  return (
    <>
      <header className={styles.telegramGuideHeader}>
        <div>
          <button className={styles.channelSetupBack} type="button" onClick={onBack}>
            Telegram
          </button>
          <span className={styles.telegramGuideKicker}>Telegram Business</span>
          <h2 id="telegram-business-guide-title">Подключить Telegram Business</h2>
          <p>Сначала создайте подключение, затем завершите его в Telegram на телефоне.</p>
        </div>
        <button
          className={styles.telegramGuideClose}
          type="button"
          aria-label="Закрыть инструкцию"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className={styles.telegramGuideBody}>
        <div className={styles.telegramGuideIntro}>
          <div className={styles.telegramGuideStatus} data-attention={needsAttention || undefined}>
            <span>{telegramGuideStatusLabel(connection, isStarting)}</span>
            <strong>{telegramGuideStatusText(connection)}</strong>
          </div>

          {errorMessage ? (
            <p className={styles.telegramGuideError} role="alert">
              {errorMessage}
            </p>
          ) : null}

          <div className={styles.telegramGuideActions}>
            {botHandle ? (
              <>
                {botUrl ? (
                  <a
                    className={styles.telegramGuidePrimary}
                    href={botUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть бота
                  </a>
                ) : null}
                <TelegramBotHandleBlock botHandle={botHandle} />
              </>
            ) : hasPreparedConnection ? (
              <div className={styles.telegramGuideActionStatus} role="status">
                <span>Канал подключён</span>
                <strong>Telegram Business готов к работе</strong>
              </div>
            ) : (
              <button
                className={styles.telegramGuidePrimary}
                type="button"
                disabled={isStarting}
                onClick={() => onStartConnection()}
              >
                {isStarting ? "Создаём подключение" : startButtonLabel}
              </button>
            )}
          </div>
        </div>

        <div className={styles.telegramGuidePreview} aria-label="Превью подключения в Telegram">
          <TelegramPhonePreview step={selectedStep} botHandle={botHandle} />
        </div>

        <ol className={styles.telegramWizardRail} aria-label="Шаги подключения">
          {telegramGuideStepList.map((step) => (
            <li key={step.id}>
              <button
                type="button"
                aria-pressed={selectedStep === step.id}
                aria-label={`Шаг ${step.id}: ${step.label}`}
                data-active={selectedStep === step.id || undefined}
                data-complete={step.id <= activeStep || undefined}
                onClick={() => setSelectedStep(step.id)}
              >
                <span>{step.id}</span>
                {step.label}
              </button>
            </li>
          ))}
        </ol>

        <section className={styles.telegramGuideCurrentStep}>
          <span>Шаг {selectedStep}</span>
          <h3>{selectedStepCopy.title}</h3>
          <p>{selectedStepCopy.body}</p>
          <p className={styles.telegramGuidePath}>Настройки → Telegram Business → Чат-боты</p>
        </section>
      </div>
    </>
  );
}

const telegramGuideStepList: Array<{ readonly id: TelegramGuideStepId; readonly label: string }> = [
  { id: 1, label: "Создать" },
  { id: 2, label: "Открыть бота" },
  { id: 3, label: "Добавить бота" },
  { id: 4, label: "Выбрать чаты" },
  { id: 5, label: "Подтвердить" }
];

function TelegramBotHandleBlock({ botHandle }: { readonly botHandle: string }) {
  return (
    <div className={styles.telegramGuideBotHandle}>
      <code>{botHandle}</code>
      <button
        className={styles.telegramGuideBotHandleCopy}
        type="button"
        aria-label="Скопировать username бота"
        onClick={() => copyTelegramBotUsername(botHandle)}
      >
        <span aria-hidden="true" />
      </button>
    </div>
  );
}

function telegramGuideStepCopy(step: TelegramGuideStepId, botHandle: string | null) {
  if (step === 1) {
    return {
      title: "Создайте подключение",
      body: "ElevenHouse подготовит username бота и начнёт ждать подтверждение от Telegram."
    };
  }

  if (step === 2) {
    return {
      title: "Откройте бота по ссылке",
      body: "Нажмите «Открыть бота» и запустите чат, чтобы ElevenHouse привязал заявку к вашему Telegram аккаунту."
    };
  }

  if (step === 3) {
    return {
      title: "Добавьте бота в Telegram Business",
      body: botHandle
        ? `Откройте настройки Telegram Business, найдите ${botHandle}, выберите его в списке и нажмите «ДОБАВИТЬ».`
        : "После создания подключения здесь появится username бота, который нужно добавить в Telegram Business."
    };
  }

  if (step === 4) {
    return {
      title: "Выберите доступные чаты",
      body: "Разрешите боту читать и отвечать только в нужных клиентских диалогах."
    };
  }

  return {
    title: "Проверьте подтверждение",
    body: "Когда Telegram пришлёт подтверждение, канал появится в ElevenHouse как подключённый."
  };
}

function TelegramPhonePreview({
  step,
  botHandle
}: {
  readonly step: TelegramGuideStepId;
  readonly botHandle: string | null;
}) {
  const handle = botHandle ?? "@elevenhouse_bot";

  return (
    <div className={styles.telegramPhoneFrame}>
      <div className={styles.telegramPhoneBar} />
      <div className={styles.telegramPhoneScreen}>
        {step === 1 ? <TelegramCreatePreview /> : null}
        {step === 2 ? <TelegramSettingsPreview /> : null}
        {step === 3 ? <TelegramBotSearchPreview botHandle={handle} /> : null}
        {step === 4 ? <TelegramAccessPreview /> : null}
        {step === 5 ? <TelegramConfirmPreview botHandle={handle} /> : null}
      </div>
    </div>
  );
}

function TelegramCreatePreview() {
  return (
    <div className={styles.telegramTelegramScreen}>
      <TelegramPreviewHeader title="ElevenHouse" />
      <div className={styles.telegramConnectionPanel}>
        <span className={styles.telegramConnectionLogo}>EH</span>
        <strong>Подключение готовится</strong>
        <p>Создайте подключение в ElevenHouse, затем Telegram покажет username бота.</p>
        <span>Ожидаем Telegram</span>
      </div>
    </div>
  );
}

function TelegramSettingsPreview() {
  return (
    <div className={styles.telegramTelegramScreen}>
      <TelegramPreviewHeader title="Telegram для бизнеса" />
      <div className={styles.telegramSettingsGroup}>
        <TelegramSettingsRow
          icon="A"
          title="Адрес"
          subtitle="Адрес и точка на карте в Вашем профиле."
          tone="orange"
        />
        <TelegramSettingsRow
          icon="↩"
          title="Быстрые ответы"
          subtitle="Заготовки ответов с медиафайлами."
          tone="red"
        />
        <TelegramSettingsRow
          icon="✦"
          title="Telegram для бизнеса"
          subtitle="Настройки автоматизации и профиля."
          tone="pink"
        />
        <TelegramSettingsRow
          icon="⌁"
          title="Чат-боты"
          subtitle="Подключение сторонних ботов для взаимодействия с клиентами."
          tone="blue"
          highlighted
        />
      </div>
    </div>
  );
}

function TelegramBotSearchPreview({ botHandle }: { readonly botHandle: string }) {
  return (
    <div className={styles.telegramTelegramScreen}>
      <div className={styles.telegramAutomationHeader}>
        <span className={styles.telegramPhoneBack}>‹</span>
        <div className={styles.telegramAutomationArt} aria-hidden="true">
          <span className={styles.telegramAutomationSun}>11</span>
          <span className={styles.telegramAutomationBot}>EH</span>
        </div>
        <h4>Автоматизация чатов</h4>
        <p>Подключите бота, который будет отвечать на сообщения от Вашего имени.</p>
      </div>
      <div className={styles.telegramBotPickerCard}>
        <div className={styles.telegramBotPickerSearch}>
          <span>{botHandle}</span>
          <em>×</em>
        </div>
        <div className={styles.telegramBotPickerResult}>
          <span className={styles.telegramBotPickerAvatar}>1</span>
          <span>
            <strong>11houseTest</strong>
            <small>{botHandle}</small>
          </span>
          <span className={styles.telegramBotPickerAdd}>ДОБАВИТЬ</span>
        </div>
      </div>
      <p className={styles.telegramAutomationHint}>
        Выберите бота, который будет автоматически обрабатывать Ваши чаты.
      </p>
    </div>
  );
}

function TelegramAccessPreview() {
  return (
    <div className={styles.telegramTelegramScreen}>
      <TelegramPreviewHeader title="Автоматизация чатов" />
      <div className={styles.telegramSettingsGroup}>
        <TelegramSettingsRow
          icon="✓"
          title="Доступные чаты"
          subtitle="Выберите диалоги, где бот сможет читать и отвечать."
          tone="blue"
          highlighted
        />
        <TelegramSettingsRow
          icon="1"
          title="Все личные чаты"
          subtitle="Не включайте, если бот нужен только для клиентов."
          value="Выкл."
          tone="purple"
        />
        <TelegramSettingsRow
          icon="↩"
          title="Ответ от имени бизнеса"
          subtitle="Разрешите боту отправлять ответы в выбранных чатах."
          value="Вкл."
          tone="green"
        />
      </div>
      <p className={styles.telegramAutomationHint}>
        Рекомендуем выбрать только клиентские диалоги, чтобы не открывать доступ ко всем чатам.
      </p>
    </div>
  );
}

function TelegramConfirmPreview({ botHandle }: { readonly botHandle: string }) {
  return (
    <div className={styles.telegramTelegramScreen}>
      <TelegramPreviewHeader title="Чат-боты" />
      <div className={styles.telegramConnectionPanel}>
        <span className={styles.telegramConnectionSuccess}>✓</span>
        <strong>{botHandle}</strong>
        <p>Бот добавлен и сможет отвечать в выбранных клиентских чатах.</p>
        <span>Подключено</span>
      </div>
    </div>
  );
}

function TelegramPreviewHeader({ title }: { readonly title: string }) {
  return (
    <div className={styles.telegramPhoneHeader}>
      <span className={styles.telegramPhoneBack}>‹</span>
      <strong>{title}</strong>
      <span aria-hidden="true" />
    </div>
  );
}

function TelegramSettingsRow({
  icon,
  title,
  subtitle,
  value,
  tone,
  highlighted
}: {
  readonly icon: string;
  readonly title: string;
  readonly subtitle: string;
  readonly value?: string;
  readonly tone: "blue" | "green" | "orange" | "pink" | "purple" | "red";
  readonly highlighted?: boolean;
}) {
  return (
    <div className={styles.telegramSettingsRow} data-highlight={highlighted || undefined}>
      <span className={styles.telegramSettingsIcon} data-tone={tone}>
        {icon}
      </span>
      <span className={styles.telegramSettingsText}>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      {value ? <em>{value}</em> : null}
      <span className={styles.telegramSettingsChevron}>›</span>
    </div>
  );
}

function dialogTitleId(step: ChannelConnectionStep) {
  if (step === "channels") return "channel-connection-title";
  if (step === "telegram-methods") return "telegram-method-title";
  if (step === "telegram-mtproto") return "telegram-mtproto-guide-title";
  if (step === "instagram-graph") return "instagram-graph-guide-title";

  return "telegram-business-guide-title";
}

function telegramChannelStatusText(connection: MessagingChannelConnection | undefined) {
  if (!connection) return "Не подключён";
  if (connection.status === "active") return "Подключён";
  if (connection.status === "connecting") return "Ожидает подтверждения";
  if (connection.status === "reauth_required") return "Нужны права";
  if (connection.status === "revoked") return "Отключён";

  return "Требует внимания";
}

function telegramBusinessMethodStatusText(connection: MessagingChannelConnection | undefined) {
  if (!connection) return "Не подключён";
  if (connection.status === "active") return "Подключён";
  if (connection.status === "connecting") return "Ожидаем Telegram";

  return "Можно настроить заново";
}

function instagramChannelStatusText(connection: MessagingChannelConnection | undefined) {
  if (!connection) return "Не подключён";
  if (connection.status === "active") return "Подключён";
  if (connection.status === "connecting") return "Ожидает Meta";
  if (connection.status === "reauth_required") return "Нужна повторная авторизация";
  if (connection.status === "revoked") return "Отключён";

  return "Требует внимания";
}

function instagramGraphStatusLabel(
  connection: MessagingChannelConnection | undefined,
  isStarting: boolean
) {
  if (isStarting) return "Открываем";
  if (connection?.status === "active") return "Подключено";
  if (connection?.status === "connecting") return "Ожидает Meta";
  if (connection?.status === "reauth_required") return "Нужна авторизация";
  if (connection?.status === "revoked") return "Отключено";

  return "Не начато";
}

function instagramGraphStatusText(connection: MessagingChannelConnection | undefined) {
  if (connection?.status === "active") return "Instagram уже подключён.";
  if (connection?.status === "connecting") return "Завершите авторизацию в Meta.";
  if (connection?.status === "reauth_required") return "Meta требует повторную авторизацию.";
  if (connection?.status === "revoked") return "Канал отключён, подключите Instagram заново.";
  if (connection?.status === "error") return "Последняя попытка подключения завершилась ошибкой.";

  return "Начните подключение и завершите авторизацию на стороне Meta.";
}

function telegramMtprotoStatusLabel(step: TelegramMtprotoWizardStep, isActive: boolean) {
  if (isActive) return "Подключено";
  if (step === "code") return "Ждём код";
  if (step === "password") return "Нужен 2FA";

  return "Не начато";
}

function telegramMtprotoStatusText({
  connection,
  isActive,
  maskedPhoneNumber,
  retryAfterSeconds,
  step
}: {
  readonly connection: MessagingChannelConnection | undefined;
  readonly isActive: boolean;
  readonly maskedPhoneNumber: string | null;
  readonly retryAfterSeconds: number | null;
  readonly step: TelegramMtprotoWizardStep;
}) {
  if (isActive) return "Telegram Account уже подключён.";
  if (retryAfterSeconds) return `Telegram просит повторить через ${retryAfterSeconds} сек.`;
  if (connection?.status === "reauth_required") return "Telegram просит повторить вход.";
  if (connection?.status === "revoked") return "Session отключена, подключите аккаунт заново.";
  if (step === "code") return `Код отправлен на ${maskedPhoneNumber ?? "указанный номер"}.`;
  if (step === "password") return "Для завершения входа нужен cloud password аккаунта.";

  return "Введите номер Telegram аккаунта и подтвердите осознанный доступ.";
}

function telegramBusinessActiveStep(
  connection: MessagingChannelConnection | undefined,
  botHandle: string | null
) {
  if (connection?.status === "active") return 5;
  if (connection?.status === "connecting" || botHandle) return 2;

  return 1;
}

function telegramGuideStatusLabel(
  connection: MessagingChannelConnection | undefined,
  isStarting: boolean
) {
  if (isStarting) return "Создаём";
  if (!connection) return "Не начато";
  if (connection.status === "connecting") return "Ожидаем Telegram";
  if (connection.status === "active") return "Подключено";
  if (connection.status === "reauth_required") return "Нужны права";
  if (connection.status === "revoked") return "Отключено";

  return "Проверьте канал";
}

function telegramGuideStatusText(connection: MessagingChannelConnection | undefined) {
  if (!connection) {
    return "Нажмите «Создать подключение», чтобы получить username бота.";
  }
  if (connection.status === "connecting") {
    return "Завершите шаги в Telegram, мы ждём подтверждение от Telegram.";
  }
  if (connection.status === "active") {
    return "Telegram Business уже подключён.";
  }
  if (connection.status === "reauth_required") {
    return "Telegram не дал нужные права на чтение или ответы.";
  }
  if (connection.status === "revoked") {
    return "Подключение отключено в Telegram, его нужно создать заново.";
  }

  return "Проверьте настройки Telegram Business и попробуйте заново.";
}

function copyTelegramBotUsername(botHandle: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return;
  }

  void navigator.clipboard.writeText(botHandle).catch(() => undefined);
}
