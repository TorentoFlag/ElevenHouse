import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type {
  AstrologerProfileResponse,
  UpsertAstrologerProfileRequest
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { SupportedLocale } from "@elevenhouse/i18n";
import {
  PROFILE_LANGUAGE_OPTIONS,
  PROFILE_METHOD_OPTIONS,
  PROFILE_SPECIALIZATION_OPTIONS,
  PROFILE_VISIBILITY_OPTIONS,
  createProfileSettingsDraft,
  createUpsertAstrologerProfileRequest,
  getProfileSettingsDraftValidationMessage,
  isProfileSettingsDraftDirty,
  toggleProfileStringValue,
  type AstrologerProfileSettingsDraft
} from "../model/profileSettingsForm";
import styles from "../../../pages/settings/SettingsPage.module.css";

export type ProfileSettingsFormProps = {
  readonly locale: SupportedLocale;
  readonly profile: AstrologerProfileResponse | null;
  readonly isSaving: boolean;
  readonly onSave: (body: UpsertAstrologerProfileRequest) => void;
};

export function ProfileSettingsForm({
  locale,
  profile,
  isSaving,
  onSave
}: ProfileSettingsFormProps) {
  const [draft, setDraft] = useState(() => createProfileSettingsDraft(profile, locale));
  const initialDraft = useMemo(() => createProfileSettingsDraft(profile, locale), [profile, locale]);
  const validationMessage = getProfileSettingsDraftValidationMessage(draft);
  const isDirty = isProfileSettingsDraftDirty(initialDraft, draft);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  const updateDraft = <TKey extends keyof AstrologerProfileSettingsDraft>(
    key: TKey,
    value: AstrologerProfileSettingsDraft[TKey]
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const updateSocialLink = (
    key: keyof AstrologerProfileSettingsDraft["socialLinks"],
    value: string
  ) => {
    setDraft((current) => ({
      ...current,
      socialLinks: {
        ...current.socialLinks,
        [key]: value
      }
    }));
  };
  const updateOwnBirthData = (
    key: keyof AstrologerProfileSettingsDraft["ownBirthData"],
    value: string | boolean
  ) => {
    setDraft((current) => ({
      ...current,
      ownBirthData: {
        ...current.ownBirthData,
        [key]: value
      }
    }));
  };
  const toggleArrayValue = (
    key: "specializations" | "methods" | "consultationLanguages",
    value: string
  ) => {
    setDraft((current) => ({
      ...current,
      [key]: toggleProfileStringValue(current[key], value)
    }));
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validationMessage) {
      return;
    }
    onSave(createUpsertAstrologerProfileRequest(draft));
  };

  return (
    <form className={styles.profileForm} onSubmit={handleSubmit}>
      <section className={styles.settingsGroup}>
        <h2>Видимость страницы</h2>
        <p>Управляет тем, открыта ли личная страница и принимает ли оплату.</p>
        <div className={styles.visibilityList}>
          {PROFILE_VISIBILITY_OPTIONS.map((option) => {
            const selected = draft.visibilityStatus === option.id;

            return (
              <button
                className={`${styles.visibilityOption} ${
                  selected ? styles.visibilityOptionActive : ""
                }`}
                key={option.id}
                type="button"
                onClick={() => updateDraft("visibilityStatus", option.id)}
                style={{ "--visibility-color": option.color } as CSSProperties}
                aria-pressed={selected}
              >
                <span className={styles.visibilityRadio} aria-hidden="true" />
                <span>
                  <strong>{option.label}</strong>
                  <em>{option.description}</em>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.settingsGroup}>
        <h2>Аватар и обложка</h2>
        <p>Обложка - фон шапки личной страницы, аватар - круглое фото.</p>
        <Field label="Обложка страницы">
          <input
            className={styles.coverMediaInput}
            value={draft.coverMediaId}
            onChange={(event) => updateDraft("coverMediaId", event.target.value)}
            placeholder="Обложка · 1600x600"
          />
        </Field>
        <div className={styles.avatarRow}>
          <input
            className={styles.avatarMediaInput}
            aria-label="Аватар профиля media id"
            value={draft.avatarMediaId}
            onChange={(event) => updateDraft("avatarMediaId", event.target.value)}
            placeholder="Фото"
          />
          <div>
            <strong>Аватар профиля</strong>
            <span>Квадрат от 320x320. Виден в карточках и на странице.</span>
          </div>
        </div>
      </section>

      <section className={styles.settingsGroup}>
        <h2>Публичный профиль</h2>
        <p>Эти поля видны клиентам на личной странице.</p>
        <div className={styles.fieldGrid}>
          <Field label="Отображаемое имя">
            <input
              value={draft.publicName}
              onChange={(event) => updateDraft("publicName", event.target.value)}
              required
              maxLength={200}
            />
          </Field>
          <Field label="Короткая ссылка">
            <div className={styles.handleInput}>
              <span>elevenhouse.app/</span>
              <input
                value={draft.publicHandle}
                onChange={(event) =>
                  updateDraft("publicHandle", normalizeHandleInput(event.target.value))
                }
                required
                minLength={3}
                maxLength={64}
                aria-label="Короткая ссылка"
              />
            </div>
          </Field>
        </div>
        <Field label="Тэглайн">
          <input
            value={draft.headline}
            onChange={(event) => updateDraft("headline", event.target.value)}
            maxLength={240}
          />
        </Field>
        <Field label="О себе">
          <textarea
            value={draft.bio}
            onChange={(event) => updateDraft("bio", event.target.value)}
            maxLength={600}
            rows={4}
          />
        </Field>
      </section>

      <section className={styles.settingsGroup}>
        <h2>Профессиональный профиль</h2>
        <p>Опыт, школа и методы - формируют доверие и фильтры в каталоге.</p>
        <div className={styles.fieldGrid}>
          <Field label="Стаж практики, лет">
            <div className={styles.stepper}>
              <button
                type="button"
                onClick={() =>
                  updateDraft(
                    "professionalExperienceYears",
                    Math.max(0, (draft.professionalExperienceYears ?? 0) - 1)
                  )
                }
              >
                -
              </button>
              <span>{draft.professionalExperienceYears ?? 0}</span>
              <button
                type="button"
                onClick={() =>
                  updateDraft(
                    "professionalExperienceYears",
                    (draft.professionalExperienceYears ?? 0) + 1
                  )
                }
              >
                +
              </button>
            </div>
          </Field>
          <Field label="Школа / подход">
            <input
              value={draft.professionalSchool}
              onChange={(event) => updateDraft("professionalSchool", event.target.value)}
              placeholder="Например, психологическая астрология"
            />
          </Field>
        </div>
        <ChipField
          label="Специализации"
          hint="Видны бейджами на странице."
          options={PROFILE_SPECIALIZATION_OPTIONS}
          values={draft.specializations}
          onToggle={(value) => toggleArrayValue("specializations", value)}
        />
        <ChipField
          label="Системы и методы"
          hint="Определяют доступные инструменты расчёта."
          options={PROFILE_METHOD_OPTIONS}
          values={draft.methods}
          onToggle={(value) => toggleArrayValue("methods", value)}
        />
        <ChipField
          label="Языки консультаций"
          options={PROFILE_LANGUAGE_OPTIONS}
          values={draft.consultationLanguages}
          onToggle={(value) => toggleArrayValue("consultationLanguages", value)}
        />
      </section>

      <section className={styles.settingsGroup}>
        <h2>Контакты и соцсети</h2>
        <p>Показываются ссылками на личной странице и используются для связывания диалогов.</p>
        <SocialField
          iconName="chat"
          label="Telegram"
          prefix="@"
          value={draft.socialLinks.telegram}
          placeholder="username"
          onChange={(value) => updateSocialLink("telegram", value)}
        />
        <SocialField
          iconName="flow"
          label="Instagram"
          prefix="@"
          value={draft.socialLinks.instagram}
          placeholder="username"
          onChange={(value) => updateSocialLink("instagram", value)}
        />
        <SocialField
          iconName="chat"
          label="WhatsApp"
          value={draft.socialLinks.whatsapp}
          placeholder="+7..."
          onChange={(value) => updateSocialLink("whatsapp", value)}
        />
        <SocialField
          iconName="reference"
          label="Сайт"
          value={draft.socialLinks.website}
          placeholder="example.ru"
          onChange={(value) => updateSocialLink("website", value)}
        />
      </section>

      <section className={styles.settingsGroup}>
        <h2>Мои данные рождения</h2>
        <p>Для личной натальной карты. На странице показывается по вашему желанию.</p>
        <div className={styles.fieldGrid}>
          <Field label="Дата">
            <input
              type="date"
              value={draft.ownBirthData.date}
              onChange={(event) => updateOwnBirthData("date", event.target.value)}
            />
          </Field>
          <Field label="Время">
            <input
              type="time"
              value={draft.ownBirthData.time}
              onChange={(event) => updateOwnBirthData("time", event.target.value)}
            />
          </Field>
        </div>
        <Field label="Место рождения">
          <input
            value={draft.ownBirthData.place}
            onChange={(event) => updateOwnBirthData("place", event.target.value)}
            placeholder="Город"
          />
        </Field>
        <label className={styles.toggleRow}>
          <span>Показывать мою карту на странице</span>
          <input
            type="checkbox"
            checked={draft.ownBirthData.showOnPublicPage}
            onChange={(event) => updateOwnBirthData("showOnPublicPage", event.target.checked)}
          />
        </label>
      </section>

      <section className={styles.settingsGroup}>
        <h2>Локаль</h2>
        <div className={styles.fieldGrid}>
          <Field label="Часовой пояс">
            <input
              value={draft.timezone}
              onChange={(event) => updateDraft("timezone", event.target.value)}
              required
            />
          </Field>
          <Field label="Язык профиля">
            <input
              value={draft.locale}
              onChange={(event) => updateDraft("locale", event.target.value)}
              required
            />
          </Field>
        </div>
      </section>

      {validationMessage ? (
        <p className={styles.formError} role="alert">
          {validationMessage}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          type="submit"
          disabled={isSaving || !isDirty || Boolean(validationMessage)}
        >
          {isSaving ? "Сохраняем" : "Сохранить"}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={isSaving || !isDirty}
          onClick={() => setDraft(initialDraft)}
        >
          Отменить
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span>
        {label}
        {hint ? <em>{hint}</em> : null}
      </span>
      {children}
    </label>
  );
}

function ChipField({
  label,
  hint,
  options,
  values,
  onToggle
}: {
  readonly label: string;
  readonly hint?: string;
  readonly options: readonly string[];
  readonly values: readonly string[];
  readonly onToggle: (value: string) => void;
}) {
  return (
    <div className={styles.field}>
      <span>
        {label}
        {hint ? <em>{hint}</em> : null}
      </span>
      <div className={styles.chipList}>
        {options.map((option) => {
          const selected = values.includes(option);

          return (
            <button
              className={`${styles.chip} ${selected ? styles.chipActive : ""}`}
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              aria-pressed={selected}
            >
              {selected ? (
                <Icon iconName="check" width={13} height={13} aria-hidden="true" />
              ) : null}
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SocialField({
  iconName,
  label,
  prefix,
  value,
  placeholder,
  onChange
}: {
  readonly iconName: "chat" | "flow" | "reference";
  readonly label: string;
  readonly prefix?: string;
  readonly value: string;
  readonly placeholder: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className={styles.socialField}>
      <span className={styles.socialIcon}>
        <Icon iconName={iconName} width={17} height={17} aria-hidden="true" />
      </span>
      <label className={styles.socialControl}>
        <span>{label}</span>
        <span className={styles.prefixedInput}>
          {prefix ? <em>{prefix}</em> : null}
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
          />
        </span>
      </label>
    </div>
  );
}

function normalizeHandleInput(value: string): string {
  return value.replace(/[^a-z0-9-]/gi, "").toLowerCase();
}
