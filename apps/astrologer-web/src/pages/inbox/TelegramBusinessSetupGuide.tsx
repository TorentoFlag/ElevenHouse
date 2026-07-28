import type { MessagingChannelConnection } from "@elevenhouse/contracts";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./InboxPage.module.css";

export type ChannelConnectionDialogProps = {
  readonly connection: MessagingChannelConnection | undefined;
  readonly isStarting: boolean;
  readonly errorMessage: string | null;
  readonly telegramBotUsername: string | null;
  readonly onStartConnection: () => void;
  readonly onClose: () => void;
};

type ChannelConnectionStep = "channels" | "telegram-methods" | "telegram-business";
type TelegramGuideStepId = 1 | 2 | 3 | 4 | 5;

export function ChannelConnectionDialog({
  connection,
  isStarting,
  errorMessage,
  telegramBotUsername,
  onStartConnection,
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
          step === "telegram-business" ? styles.telegramGuideDialog : styles.channelSetupDialog
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId(step)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {step === "channels" ? (
          <ChannelSelection
            connection={connection}
            onClose={onClose}
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
            onBack={() => setStep("telegram-methods")}
            onClose={onClose}
            onStartConnection={onStartConnection}
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
  onClose,
  onSelectTelegram
}: {
  readonly connection: MessagingChannelConnection | undefined;
  readonly onClose: () => void;
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
          aria-label="Instagram скоро"
          disabled
        >
          <span className={styles.channelSetupBadgeInstagram}>I</span>
          <span className={styles.channelSetupRowText}>
            <strong>Instagram</strong>
            <span>Следующий канал подключения</span>
          </span>
          <span className={styles.channelSetupRowAction}>Скоро</span>
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
            <span>Второй способ подключения Telegram аккаунта.</span>
            <em>Будет доступно позже</em>
          </span>
        </button>
      </div>
    </>
  );
}

function TelegramBusinessGuide({
  botHandle,
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
              <TelegramBotHandleBlock botHandle={botHandle} />
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
  { id: 2, label: "Открыть Telegram" },
  { id: 3, label: "Найти бота" },
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
      title: "Откройте настройки Telegram Business",
      body: "На телефоне откройте Telegram с вашим Business аккаунтом и перейдите в раздел чат-ботов."
    };
  }

  if (step === 3) {
    return {
      title: "Введите username бота в Telegram",
      body: botHandle
        ? `Найдите ${botHandle}, выберите его в списке и нажмите «ДОБАВИТЬ».`
        : "После создания подключения здесь появится username бота, который нужно добавить в Telegram."
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
