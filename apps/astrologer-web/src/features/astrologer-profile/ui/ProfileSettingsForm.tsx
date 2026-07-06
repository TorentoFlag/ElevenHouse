import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type ReactNode
} from "react";
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
  reconcileProfileSettingsDraftAfterProfileChange,
  toggleProfileStringValue,
  type AstrologerProfileSettingsDraft
} from "../model/profileSettingsForm";
import { uploadMediaFile } from "../../media/api/uploadMediaFile";
import styles from "../../../pages/settings/SettingsPage.module.css";

export type ProfileSettingsFormProps = {
  readonly locale: SupportedLocale;
  readonly profile: AstrologerProfileResponse | null;
  readonly isSaving: boolean;
  readonly onDirtyChange?: (isDirty: boolean) => void;
  readonly onSave: (body: UpsertAstrologerProfileRequest) => void;
};
type ProfileMediaTarget = "avatar" | "cover";

type ProfileMediaPreviewState = {
  readonly avatarUrl: string | null;
  readonly coverUrl: string | null;
  readonly uploadingTarget: ProfileMediaTarget | null;
  readonly error: string | null;
};

export function ProfileSettingsForm({
  locale,
  profile,
  isSaving,
  onDirtyChange,
  onSave
}: ProfileSettingsFormProps) {
  const [draft, setDraft] = useState(() => createProfileSettingsDraft(profile, locale));
  const [mediaPreview, setMediaPreview] = useState<ProfileMediaPreviewState>(() =>
    createProfileMediaPreviewState(profile)
  );
  const initialDraft = useMemo(
    () => createProfileSettingsDraft(profile, locale),
    [profile, locale]
  );
  const previousInitialDraftRef = useRef(initialDraft);
  const draftRef = useRef(draft);
  const validationMessage = getProfileSettingsDraftValidationMessage(draft);
  const isDirty = isProfileSettingsDraftDirty(initialDraft, draft);
  const isUploadingMedia = Boolean(mediaPreview.uploadingTarget);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const result = reconcileProfileSettingsDraftAfterProfileChange({
      previousInitialDraft: previousInitialDraftRef.current,
      currentDraft: draftRef.current,
      nextInitialDraft: initialDraft
    });

    if (result.shouldReplaceDraft) {
      setDraft(result.draft);
      draftRef.current = result.draft;
      setMediaPreview(createProfileMediaPreviewState(profile));
    }
    previousInitialDraftRef.current = initialDraft;
  }, [initialDraft, profile]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

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
    if (validationMessage || isUploadingMedia) {
      return;
    }
    onSave(createUpsertAstrologerProfileRequest(draft));
  };
  const handleMediaUpload = async (target: ProfileMediaTarget, file: File) => {
    if (isSaving || isUploadingMedia) {
      return;
    }

    const previousUrl = target === "avatar" ? mediaPreview.avatarUrl : mediaPreview.coverUrl;
    const urlKey = target === "avatar" ? "avatarUrl" : "coverUrl";
    const draftKey = target === "avatar" ? "avatarMediaId" : "coverMediaId";
    const purpose = target === "avatar" ? "profile_avatar" : "profile_cover";
    const previewUrl = createObjectUrl(file);

    setMediaPreview((current) => ({
      ...current,
      [urlKey]: previewUrl ?? current[urlKey],
      uploadingTarget: target,
      error: null
    }));

    try {
      const media = await uploadMediaFile({ purpose, file });
      setDraft((current) => ({ ...current, [draftKey]: media.id }));
      setMediaPreview((current) => ({
        ...current,
        [urlKey]: media.url,
        uploadingTarget: null,
        error: null
      }));
    } catch {
      setMediaPreview((current) => ({
        ...current,
        [urlKey]: previousUrl,
        uploadingTarget: null,
        error: "Не удалось загрузить изображение. Попробуйте другой файл."
      }));
    } finally {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    }
  };
  const removeProfileMedia = (target: ProfileMediaTarget) => {
    const urlKey = target === "avatar" ? "avatarUrl" : "coverUrl";
    const draftKey = target === "avatar" ? "avatarMediaId" : "coverMediaId";

    setDraft((current) => ({ ...current, [draftKey]: "" }));
    setMediaPreview((current) => ({
      ...current,
      [urlKey]: null,
      error: null
    }));
  };
  const resetDraft = () => {
    setDraft(initialDraft);
    setMediaPreview(createProfileMediaPreviewState(profile));
  };

  return (
    <form className={styles.profileForm} onSubmit={handleSubmit}>
      <section className={styles.settingsGroup}>
        <h2>Видимость страницы</h2>
        <p>Управляет тем, открыта ли личная страница и принимает ли оплату.</p>
        <div className={styles.visibilityList} role="radiogroup" aria-label="Видимость страницы">
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
                role="radio"
                aria-checked={selected}
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
        <div className={styles.profileMediaGrid}>
          <ProfileMediaUpload
            label="Обложка страницы"
            hint="JPG, PNG или WebP. Лучше 1600x600."
            shape="cover"
            currentUrl={mediaPreview.coverUrl}
            isUploading={mediaPreview.uploadingTarget === "cover"}
            disabled={isSaving || isUploadingMedia}
            onUpload={(file) => handleMediaUpload("cover", file)}
            onRemove={() => removeProfileMedia("cover")}
          />
          <ProfileMediaUpload
            label="Аватар профиля"
            hint="Квадрат от 320x320. Виден в карточках и на странице."
            shape="avatar"
            currentUrl={mediaPreview.avatarUrl}
            isUploading={mediaPreview.uploadingTarget === "avatar"}
            disabled={isSaving || isUploadingMedia}
            onUpload={(file) => handleMediaUpload("avatar", file)}
            onRemove={() => removeProfileMedia("avatar")}
          />
        </div>
        {mediaPreview.error ? (
          <p className={styles.profileMediaError} role="alert">
            {mediaPreview.error}
          </p>
        ) : null}
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
        <p>Опыт, школа и методы помогают клиенту понять ваш подход до записи.</p>
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
          disabled={isSaving || isUploadingMedia || !isDirty || Boolean(validationMessage)}
        >
          {isSaving ? "Сохраняем" : isUploadingMedia ? "Загружаем" : "Сохранить"}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={isSaving || isUploadingMedia || !isDirty}
          onClick={resetDraft}
        >
          Отменить
        </button>
      </div>
    </form>
  );
}

function ProfileMediaUpload({
  label,
  hint,
  shape,
  currentUrl,
  isUploading,
  disabled,
  onUpload,
  onRemove
}: {
  readonly label: string;
  readonly hint: string;
  readonly shape: "avatar" | "cover";
  readonly currentUrl: string | null;
  readonly isUploading: boolean;
  readonly disabled: boolean;
  readonly onUpload: (file: File) => void;
  readonly onRemove: () => void;
}) {
  const handleFile = (file: File | undefined) => {
    if (!file || disabled) {
      return;
    }
    onUpload(file);
  };
  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    handleFile(event.dataTransfer.files[0]);
  };
  const uploadLabel = currentUrl
    ? `Заменить ${label.toLowerCase()}`
    : `Загрузить ${label.toLowerCase()}`;

  return (
    <div className={styles.profileMediaUpload}>
      <div className={styles.profileMediaHeader}>
        <strong>{label}</strong>
        <em>{hint}</em>
      </div>
      <label
        className={`${styles.profileMediaDropzone} ${
          shape === "avatar" ? styles.profileMediaAvatar : styles.profileMediaCover
        }`}
        aria-label={uploadLabel}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        {currentUrl ? (
          <img className={styles.profileMediaImage} src={currentUrl} alt="" />
        ) : (
          <span className={styles.profileMediaPlaceholder}>
            <Icon
              iconName="image"
              width={shape === "avatar" ? 26 : 34}
              height={shape === "avatar" ? 26 : 34}
              aria-hidden="true"
            />
            <span>{isUploading ? "Загружаем" : "Загрузить фото"}</span>
          </span>
        )}
        {isUploading ? <span className={styles.profileMediaBusy}>Загружаем</span> : null}
        <input
          className={styles.profileMediaInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {currentUrl ? (
        <button
          className={styles.profileMediaRemove}
          type="button"
          disabled={disabled}
          onClick={onRemove}
          aria-label={`Удалить ${label.toLowerCase()}`}
        >
          <Icon iconName="trash" width={15} height={15} aria-hidden="true" />
          Удалить
        </button>
      ) : null}
    </div>
  );
}

function createProfileMediaPreviewState(
  profile: AstrologerProfileResponse | null
): ProfileMediaPreviewState {
  return {
    avatarUrl: profile?.avatarMedia?.url ?? null,
    coverUrl: profile?.coverMedia?.url ?? null,
    uploadingTarget: null,
    error: null
  };
}

function createObjectUrl(file: File): string | null {
  return typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;
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
