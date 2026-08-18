import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type {
  ClientBirthDataResponse,
  ClientBirthPlaceCandidate,
  ClientCabinetOverviewResponse,
  ClientRelatedBirthProfileResponse
} from "@elevenhouse/contracts";
import type { SessionSummary } from "@elevenhouse/contracts";
import { Link } from "react-router";
import type { FormEvent } from "react";
import type { SupportedLocale } from "@elevenhouse/i18n";
import type {
  BirthPlaceSearchCopy,
  BirthTimeOccurrenceCopy,
  ClientPurchaseFlowCopy
} from "../../common/i18n/clientCopy";
import { BirthPlaceAutocomplete } from "../../features/client-profile/components/BirthPlaceAutocomplete";
import { ClientPurchaseFlow } from "../../features/client-commerce/components/ClientPurchaseFlow";
import { AstroDiaryRelationshipLink } from "../../features/astro-diary/ui/AstroDiaryRelationshipLink";
import {
  applyBirthPlaceCandidate,
  createBirthProfileForm,
  updateBirthDate,
  updateBirthPlaceQuery,
  updateBirthTime,
  updateBirthTimeDstOccurrence,
  type BirthProfileFormState
} from "../../features/client-profile/model/birthProfileFormModel";
import styles from "./MePage.module.css";

export type ClientCabinetSection = "home" | "booking" | "sessions" | "feed" | "data" | "billing";
export type ClientCabinetStatus =
  | "loading"
  | "ready"
  | "saving"
  | "saved"
  | "validation-error"
  | "error";
export type ClientCabinetValidationScope = "birth-profile" | "related-profile" | null;
export type { BirthProfileFormState } from "../../features/client-profile/model/birthProfileFormModel";

export type RelatedBirthProfileFormState = {
  readonly displayName: string;
  readonly relationshipLabel: string;
  readonly birth: BirthProfileFormState;
};

const emptyRelatedProfileForm: RelatedBirthProfileFormState = {
  displayName: "",
  relationshipLabel: "",
  birth: createBirthProfileForm(null)
};

export type MePageViewProps = {
  readonly activeSection: ClientCabinetSection;
  readonly birthPlaceSearch: {
    readonly copy: BirthPlaceSearchCopy;
    readonly onSearch: (
      query: string,
      signal: AbortSignal
    ) => Promise<readonly ClientBirthPlaceCandidate[]>;
  };
  readonly birthTimeOccurrenceCopy: BirthTimeOccurrenceCopy;
  readonly clientLocale: SupportedLocale;
  readonly form: BirthProfileFormState;
  readonly overview: ClientCabinetOverviewResponse | null;
  readonly relatedProfileForm?: RelatedBirthProfileFormState;
  readonly status: ClientCabinetStatus;
  readonly validationScope?: ClientCabinetValidationScope;
  readonly sessions?: readonly SessionSummary[];
  readonly sessionsStatus?: "loading" | "ready" | "error";
  readonly onFormChange: (nextForm: BirthProfileFormState) => void;
  readonly onRelatedProfileFormChange?: (nextForm: RelatedBirthProfileFormState) => void;
  readonly onRelatedProfileSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  readonly onRetry: () => void;
  readonly onRetrySessions?: () => void;
  readonly onSectionChange: (section: ClientCabinetSection) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly purchaseFlowCopy: ClientPurchaseFlowCopy;
};

const navItems: ReadonlyArray<{
  readonly id: ClientCabinetSection;
  readonly iconName: "layoutGrid" | "calendar" | "video" | "content" | "orbit" | "wallet";
  readonly label: string;
}> = [
  { id: "home", iconName: "layoutGrid", label: "Главная" },
  { id: "booking", iconName: "calendar", label: "Запись" },
  { id: "sessions", iconName: "video", label: "Консультации" },
  { id: "feed", iconName: "content", label: "Лента" },
  { id: "data", iconName: "orbit", label: "Мои данные" },
  { id: "billing", iconName: "wallet", label: "Подписки" }
];

export function MePageView({
  activeSection,
  birthPlaceSearch,
  birthTimeOccurrenceCopy,
  clientLocale,
  form,
  overview,
  relatedProfileForm = emptyRelatedProfileForm,
  status,
  validationScope = null,
  sessions = [],
  sessionsStatus = "ready",
  onFormChange,
  onRelatedProfileFormChange = () => undefined,
  onRelatedProfileSubmit = (event) => event.preventDefault(),
  onRetry,
  onRetrySessions = () => undefined,
  onSectionChange,
  onSubmit,
  purchaseFlowCopy
}: MePageViewProps) {
  const isLoading = status === "loading";
  const activeTitle = navItems.find((item) => item.id === activeSection)?.label ?? "Главная";

  if (isLoading) {
    return (
      <main className={styles.page} aria-busy="true">
        <CenteredState
          title="Загружаем кабинет"
          text="Проверяем ваши связи и сохранённые данные."
        />
      </main>
    );
  }

  if (status === "error" && overview === null) {
    return (
      <main className={styles.page}>
        <CenteredState
          title="Не удалось загрузить кабинет"
          text="Повторите запрос. Если ошибка сохранится, мы покажем её в диагностике API."
          action={
            <button className={styles.primaryButton} onClick={onRetry}>
              Повторить
            </button>
          }
        />
      </main>
    );
  }

  const safeOverview = overview ?? emptyOverview;

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar} aria-label="Кабинет клиента">
        <div className={styles.brand}>
          <Icon iconName="logoMoon" size={34} />
          <div>
            <strong>ElevenHouse</strong>
            <span>Кабинет клиента</span>
          </div>
        </div>

        <section className={styles.astrologerSelector} aria-label="Связанные астрологи">
          <button className={styles.selectorButton} type="button" disabled>
            <span className={styles.selectorIcon}>
              <Icon iconName="users" size={17} />
            </span>
            <span>
              <span className={styles.eyebrow}>Астролог</span>
              <strong>Все · {safeOverview.astrologers.length}</strong>
            </span>
            <Icon iconName="chevronDown" size={16} />
          </button>
          {safeOverview.astrologers.length === 0 ? (
            <p className={styles.selectorHint}>
              Новые астрологи появляются здесь после входа по личной ссылке астролога.
            </p>
          ) : (
            <ul className={styles.astrologerList}>
              {safeOverview.astrologers.map((astrologer) => (
                <li key={astrologer.astrologerUserId}>
                  <span className={styles.avatar}>{getInitials(astrologer.publicName)}</span>
                  <span>
                    <strong>{astrologer.publicName}</strong>
                    <small>@{astrologer.publicHandle}</small>
                  </span>
                  {astrologer.relationshipStatus !== "blocked" ? (
                    <AstroDiaryRelationshipLink
                      astrologerId={astrologer.astrologerUserId}
                      className={styles.astroDiaryLink}
                      label="AstroDiary"
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <nav className={styles.nav} aria-label="Разделы кабинета">
          {navItems.map((item) => {
            const isActive = item.id === activeSection;
            return (
              <button
                key={item.id}
                className={isActive ? styles.navItemActive : styles.navItem}
                type="button"
                onClick={() => onSectionChange(item.id)}
              >
                <Icon iconName={item.iconName} size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className={styles.contentShell}>
        <header className={styles.header}>
          <h1>{activeTitle}</h1>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={safeOverview.astrologers.length === 0}
            onClick={() => onSectionChange("booking")}
          >
            <Icon iconName="plus" size={16} /> Записаться
          </button>
          <button className={styles.iconButton} type="button" disabled aria-label="Уведомления">
            <Icon iconName="bell" size={18} />
          </button>
          <div className={styles.profilePill}>
            <span className={styles.avatar}>К</span>
            <span>Клиент</span>
          </div>
        </header>

        <div className={styles.content}>
          {activeSection === "home" ? (
            <HomeSection overview={safeOverview} onSectionChange={onSectionChange} />
          ) : null}
          {activeSection === "booking" ? (
            <BookingEntrySection
              clientLocale={clientLocale}
              overview={safeOverview}
              onSectionChange={onSectionChange}
              purchaseFlowCopy={purchaseFlowCopy}
            />
          ) : null}
          {activeSection === "sessions" ? (
            <SessionsSection
              sessions={sessions}
              status={sessionsStatus}
              locale={clientLocale}
              onRetry={onRetrySessions}
            />
          ) : null}
          {activeSection === "feed" ? (
            <EmptySection title="Лента появится после публикаций связанных астрологов." />
          ) : null}
          {activeSection === "data" ? (
            <DataSection
              birthPlaceSearch={birthPlaceSearch}
              birthTimeOccurrenceCopy={birthTimeOccurrenceCopy}
              form={form}
              birthData={safeOverview.birthData}
              relatedBirthProfiles={safeOverview.relatedBirthProfiles ?? []}
              relatedProfileForm={relatedProfileForm}
              status={status}
              validationScope={validationScope}
              onFormChange={onFormChange}
              onRelatedProfileFormChange={onRelatedProfileFormChange}
              onRelatedProfileSubmit={onRelatedProfileSubmit}
              onSubmit={onSubmit}
            />
          ) : null}
          {activeSection === "billing" ? (
            <EmptySection title="Активных подписок пока нет." />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function SessionsSection({
  sessions,
  status,
  locale,
  onRetry
}: {
  readonly sessions: readonly SessionSummary[];
  readonly status: "loading" | "ready" | "error";
  readonly locale: SupportedLocale;
  readonly onRetry: () => void;
}) {
  if (status === "loading") {
    return (
      <CenteredState
        title={locale === "ru" ? "Загружаем консультации" : "Loading sessions"}
        text={locale === "ru" ? "Проверяем доступные сессии." : "Checking your available sessions."}
      />
    );
  }
  if (status === "error") {
    return (
      <CenteredState
        title={locale === "ru" ? "Не удалось загрузить консультации" : "Could not load sessions"}
        text={locale === "ru" ? "Повторите запрос." : "Please retry the request."}
        action={
          <button className={styles.primaryButton} type="button" onClick={onRetry}>
            {locale === "ru" ? "Повторить" : "Retry"}
          </button>
        }
      />
    );
  }
  if (sessions.length === 0)
    return (
      <EmptySection
        title={locale === "ru" ? "Пока нет предстоящих консультаций." : "No upcoming sessions yet."}
      />
    );
  return (
    <section
      className={styles.sessionList}
      aria-label={locale === "ru" ? "Консультации" : "Sessions"}
    >
      {sessions.map((session) => (
        <article className={styles.sessionCard} key={session.id}>
          <div>
            <span className={styles.eyebrow}>
              {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
                new Date(session.scheduledStartAt)
              )}
            </span>
            <h2>{session.productTitle}</h2>
            <p>
              {
                session.participants.find((participant) => participant.role === "astrologer")
                  ?.displayName
              }
            </p>
          </div>
          <Link className={styles.primaryButton} to={`/sessions/${session.id}`}>
            <Icon iconName="video" size={17} />{" "}
            {locale === "ru" ? "Войти в сессию" : "Join session"}
          </Link>
        </article>
      ))}
    </section>
  );
}

function HomeSection({
  overview,
  onSectionChange
}: {
  readonly overview: ClientCabinetOverviewResponse;
  readonly onSectionChange: (section: ClientCabinetSection) => void;
}) {
  return (
    <div className={styles.homeGrid}>
      <section className={styles.heroCard}>
        <span className={styles.eyebrow}>Связь с астрологами</span>
        <h2>Ваш кабинет открыт только для связанных астрологов</h2>
        <p>Новые астрологи появляются здесь после входа по личной ссылке астролога.</p>
      </section>

      <section className={styles.summaryGrid} aria-label="Сводка кабинета">
        <SummaryCard
          iconName="video"
          label="Предстоящие консультации"
          value={overview.summary.upcomingBookingCount}
        />
        <SummaryCard
          iconName="doc"
          label="Материалы"
          value={overview.summary.availableMaterialCount}
        />
        <SummaryCard
          iconName="bell"
          label="Уведомления"
          value={overview.summary.unreadNotificationCount}
        />
        <SummaryCard
          iconName="wallet"
          label="Подписки"
          value={overview.summary.activeSubscriptionCount}
        />
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <h2>Данные рождения</h2>
          <button
            className={styles.linkButton}
            type="button"
            onClick={() => onSectionChange("data")}
          >
            Открыть
          </button>
        </div>
        {overview.birthData === null ? (
          <p className={styles.emptyInline}>
            Добавьте данные рождения, чтобы использовать их в заказах и расчётах.
          </p>
        ) : (
          <BirthProfileSummary profile={overview.birthData} compact />
        )}
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <h2>Связанные астрологи</h2>
        </div>
        {overview.astrologers.length === 0 ? (
          <p className={styles.emptyInline}>
            Откройте ссылку, которую дал астролог, чтобы связать кабинеты.
          </p>
        ) : (
          <ul className={styles.relatedList}>
            {overview.astrologers.map((astrologer) => (
              <li key={astrologer.astrologerUserId}>
                <span className={styles.avatar}>{getInitials(astrologer.publicName)}</span>
                <span>
                  <strong>{astrologer.publicName}</strong>
                  <small>@{astrologer.publicHandle}</small>
                </span>
                <button
                  className={styles.linkButton}
                  type="button"
                  onClick={() => onSectionChange("booking")}
                >
                  Записаться
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BookingEntrySection({
  clientLocale,
  overview,
  onSectionChange,
  purchaseFlowCopy
}: {
  readonly clientLocale: SupportedLocale;
  readonly overview: ClientCabinetOverviewResponse;
  readonly onSectionChange: (section: ClientCabinetSection) => void;
  readonly purchaseFlowCopy: ClientPurchaseFlowCopy;
}) {
  if (overview.astrologers.length === 0) {
    return (
      <section className={styles.sectionCard}>
        <div className={styles.emptyBlock}>
          <Icon iconName="calendar" size={22} />
          <h2>Откройте ссылку астролога, чтобы записаться</h2>
          <p>В кабинете доступны только астрологи, с которыми уже есть явная связь.</p>
        </div>
      </section>
    );
  }

  return (
    <div className={styles.bookingGrid}>
      <section className={styles.sectionCard}>
        <ClientPurchaseFlow
          astrologers={overview.astrologers}
          copy={purchaseFlowCopy}
          locale={clientLocale}
        />
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Данные для записи</span>
            <h2>Профиль рождения</h2>
          </div>
          <button
            className={styles.linkButton}
            type="button"
            onClick={() => onSectionChange("data")}
          >
            Открыть
          </button>
        </div>
        {overview.birthData === null ? (
          <p className={styles.emptyInline}>
            Добавьте данные рождения, чтобы астролог мог использовать их для консультации.
          </p>
        ) : (
          <BirthProfileSummary profile={overview.birthData} compact />
        )}
      </section>
    </div>
  );
}

function DataSection({
  birthPlaceSearch,
  birthTimeOccurrenceCopy,
  form,
  birthData,
  relatedBirthProfiles,
  relatedProfileForm,
  status,
  validationScope,
  onFormChange,
  onRelatedProfileFormChange,
  onRelatedProfileSubmit,
  onSubmit
}: {
  readonly birthPlaceSearch: MePageViewProps["birthPlaceSearch"];
  readonly birthTimeOccurrenceCopy: BirthTimeOccurrenceCopy;
  readonly form: BirthProfileFormState;
  readonly birthData: ClientBirthDataResponse | null;
  readonly relatedBirthProfiles: readonly ClientRelatedBirthProfileResponse[];
  readonly relatedProfileForm: RelatedBirthProfileFormState;
  readonly status: ClientCabinetStatus;
  readonly validationScope: ClientCabinetValidationScope;
  readonly onFormChange: (nextForm: BirthProfileFormState) => void;
  readonly onRelatedProfileFormChange: (nextForm: RelatedBirthProfileFormState) => void;
  readonly onRelatedProfileSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className={styles.dataGrid}>
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Мои данные</span>
            <h2>Данные рождения</h2>
          </div>
        </div>
        {birthData === null ? (
          <p className={styles.emptyInline}>Данные рождения пока не сохранены.</p>
        ) : (
          <BirthProfileSummary profile={birthData} />
        )}
        {relatedBirthProfiles.length > 0 ? (
          <RelatedBirthProfileList profiles={relatedBirthProfiles} />
        ) : null}
      </section>

      <form className={styles.sectionCard} onSubmit={onSubmit}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Профиль рождения</span>
            <h2>Редактирование</h2>
          </div>
        </div>
        <div className={styles.formGrid}>
          <label>
            Название
            <input
              disabled={status === "saving"}
              id="client-birth-profile-label"
              name="label"
              value={form.label}
              onChange={(event) => onFormChange({ ...form, label: event.target.value })}
              placeholder="Я"
            />
          </label>
          <label>
            Дата рождения
            <input
              disabled={status === "saving"}
              id="client-birth-profile-birth-date"
              name="birthDate"
              type="date"
              value={form.birthDate}
              onChange={(event) => onFormChange(updateBirthDate(form, event.target.value))}
            />
          </label>
          <label>
            Время рождения
            <input
              disabled={status === "saving"}
              id="client-birth-profile-birth-time"
              name="birthTime"
              type="time"
              value={form.birthTime}
              onChange={(event) => onFormChange(updateBirthTime(form, event.target.value))}
            />
          </label>
          <label>
            {birthTimeOccurrenceCopy.label}
            <select
              aria-describedby="client-birth-profile-dst-occurrence-help"
              disabled={status === "saving" || !form.birthTime || !form.birthTimezone}
              id="client-birth-profile-dst-occurrence"
              name="birthTimeDstOccurrence"
              value={form.birthTimeDstOccurrence ?? ""}
              onChange={(event) =>
                onFormChange(
                  updateBirthTimeDstOccurrence(
                    form,
                    event.target.value === "first" || event.target.value === "second"
                      ? event.target.value
                      : null
                  )
                )
              }
            >
              <option value="">{birthTimeOccurrenceCopy.none}</option>
              <option value="first">{birthTimeOccurrenceCopy.first}</option>
              <option value="second">{birthTimeOccurrenceCopy.second}</option>
            </select>
            <small
              className={styles.birthTimeOccurrenceHelper}
              id="client-birth-profile-dst-occurrence-help"
            >
              {birthTimeOccurrenceCopy.helper}
            </small>
          </label>
          <BirthPlaceAutocomplete
            copy={birthPlaceSearch.copy}
            disabled={status === "saving"}
            inputId="client-birth-profile-birth-place"
            latitude={form.birthLatitude}
            longitude={form.birthLongitude}
            name="birthPlaceText"
            selectedPlaceText={form.selectedBirthPlaceText}
            timezone={form.birthTimezone}
            validationError={
              status === "validation-error" && validationScope === "birth-profile"
                ? birthPlaceSearch.copy.selectionRequired
                : null
            }
            value={form.birthPlaceText}
            onQueryChange={(value) => onFormChange(updateBirthPlaceQuery(form, value))}
            onSearch={birthPlaceSearch.onSearch}
            onSelect={(candidate) => onFormChange(applyBirthPlaceCandidate(form, candidate))}
          />
        </div>
        <button className={styles.primaryButton} type="submit" disabled={status === "saving"}>
          {status === "saving" ? "Сохраняем..." : "Сохранить данные"}
        </button>
        {status === "saved" ? <p className={styles.successText}>Сохранено</p> : null}
        {status === "error" ? (
          <p className={styles.errorText}>Не удалось выполнить действие</p>
        ) : null}
      </form>

      <form className={styles.sectionCard} onSubmit={onRelatedProfileSubmit}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Партнеры и семья</span>
            <h2>Новый профиль</h2>
          </div>
        </div>
        <div className={styles.formGrid}>
          <label>
            Имя
            <input
              disabled={status === "saving"}
              name="relatedDisplayName"
              value={relatedProfileForm.displayName}
              onChange={(event) =>
                onRelatedProfileFormChange({
                  ...relatedProfileForm,
                  displayName: event.target.value
                })
              }
              placeholder="Иванов Иван Иванович"
            />
          </label>
          <label>
            Кем приходится
            <input
              disabled={status === "saving"}
              name="relatedRelationshipLabel"
              value={relatedProfileForm.relationshipLabel}
              onChange={(event) =>
                onRelatedProfileFormChange({
                  ...relatedProfileForm,
                  relationshipLabel: event.target.value
                })
              }
              placeholder="муж"
            />
          </label>
          <label>
            Дата рождения
            <input
              disabled={status === "saving"}
              name="relatedBirthDate"
              type="date"
              value={relatedProfileForm.birth.birthDate}
              onChange={(event) =>
                onRelatedProfileFormChange({
                  ...relatedProfileForm,
                  birth: updateBirthDate(relatedProfileForm.birth, event.target.value)
                })
              }
            />
          </label>
          <label>
            Время рождения
            <input
              disabled={status === "saving"}
              name="relatedBirthTime"
              type="time"
              value={relatedProfileForm.birth.birthTime}
              onChange={(event) =>
                onRelatedProfileFormChange({
                  ...relatedProfileForm,
                  birth: updateBirthTime(relatedProfileForm.birth, event.target.value)
                })
              }
            />
          </label>
          <BirthPlaceAutocomplete
            copy={birthPlaceSearch.copy}
            disabled={status === "saving"}
            inputId="client-related-birth-profile-birth-place"
            latitude={relatedProfileForm.birth.birthLatitude}
            longitude={relatedProfileForm.birth.birthLongitude}
            name="relatedBirthPlaceText"
            selectedPlaceText={relatedProfileForm.birth.selectedBirthPlaceText}
            timezone={relatedProfileForm.birth.birthTimezone}
            validationError={
              status === "validation-error" && validationScope === "related-profile"
                ? birthPlaceSearch.copy.selectionRequired
                : null
            }
            value={relatedProfileForm.birth.birthPlaceText}
            onQueryChange={(value) =>
              onRelatedProfileFormChange({
                ...relatedProfileForm,
                birth: updateBirthPlaceQuery(relatedProfileForm.birth, value)
              })
            }
            onSearch={birthPlaceSearch.onSearch}
            onSelect={(candidate) =>
              onRelatedProfileFormChange({
                ...relatedProfileForm,
                birth: applyBirthPlaceCandidate(relatedProfileForm.birth, candidate)
              })
            }
          />
        </div>
        <button className={styles.primaryButton} type="submit" disabled={status === "saving"}>
          {status === "saving" ? "Сохраняем..." : "Сохранить профиль"}
        </button>
      </form>
    </div>
  );
}

function RelatedBirthProfileList({
  profiles
}: {
  readonly profiles: readonly ClientRelatedBirthProfileResponse[];
}) {
  return (
    <ul className={styles.birthList}>
      {profiles.map((profile) => (
        <li key={profile.id}>
          <span className={styles.birthIcon}>
            <Icon iconName="users" size={18} />
          </span>
          <span>
            <strong>{profile.displayName}</strong>
            <small>
              {profile.relationshipLabel} · {formatBirthDate(profile.birthDate)}
              {profile.birthTime ? ` · ${profile.birthTime}` : " · время неизвестно"}
              {profile.birthPlaceText ? ` · ${profile.birthPlaceText}` : ""}
            </small>
          </span>
        </li>
      ))}
    </ul>
  );
}

function BirthProfileSummary({
  profile,
  compact = false
}: {
  readonly profile: ClientBirthDataResponse;
  readonly compact?: boolean;
}) {
  return (
    <ul className={compact ? styles.birthListCompact : styles.birthList}>
      <li>
        <span className={styles.birthIcon}>
          <Icon iconName="orbit" size={18} />
        </span>
        <span>
          <strong>{profile.label ?? "Данные рождения"}</strong>
          <small>
            {formatBirthDate(profile.birthDate)}
            {profile.birthTime ? ` · ${profile.birthTime}` : " · время неизвестно"}
            {profile.birthPlaceText ? ` · ${profile.birthPlaceText}` : ""}
          </small>
        </span>
      </li>
    </ul>
  );
}

function SummaryCard({
  iconName,
  label,
  value
}: {
  readonly iconName: "video" | "doc" | "bell" | "wallet";
  readonly label: string;
  readonly value: number;
}) {
  return (
    <article className={styles.summaryCard}>
      <Icon iconName={iconName} size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function EmptySection({ title }: { readonly title: string }) {
  return (
    <section className={styles.sectionCard}>
      <div className={styles.emptyBlock}>
        <Icon iconName="sparkle" size={22} />
        <h2>{title}</h2>
      </div>
    </section>
  );
}

function CenteredState({
  action,
  text,
  title
}: {
  readonly action?: React.ReactNode;
  readonly text: string;
  readonly title: string;
}) {
  return (
    <section className={styles.centeredState}>
      <Icon iconName="logoMoon" size={38} />
      <h1>{title}</h1>
      <p>{text}</p>
      {action}
    </section>
  );
}

function formatBirthDate(value: string | null) {
  if (!value) {
    return "дата не указана";
  }

  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

const emptyOverview: ClientCabinetOverviewResponse = {
  astrologers: [],
  birthData: null,
  relatedBirthProfiles: [],
  summary: {
    directLinkOnly: true,
    upcomingBookingCount: 0,
    availableMaterialCount: 0,
    unreadNotificationCount: 0,
    activeSubscriptionCount: 0
  }
};
