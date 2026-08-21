import type {
  ClientBirthDataUpsertRequest,
  ClientRelatedBirthProfileResponse,
  ClientRelatedBirthProfileUpsertRequest
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { useEffect, useState, type ReactNode } from "react";
import type { ClientsCrmCopy } from "../../../common/i18n/astrologerCopy";
import { formatClientCrmDate } from "../model/clientsCrmPresentation";
import { ClientCrmAvatar } from "./ClientCrmAvatar";
import { BirthProfileFields } from "./ClientCrmBirthDataPanel";
import styles from "./ClientsCrm.module.css";

type BirthTimePrecision = ClientBirthDataUpsertRequest["birthTimePrecision"];

type ClientCrmRelatedProfilesPanelProps = {
  readonly copy: ClientsCrmCopy;
  readonly profiles: readonly ClientRelatedBirthProfileResponse[];
  readonly locale: SupportedLocale;
  readonly isSaving: boolean;
  readonly isError: boolean;
  readonly onCreate: (input: ClientRelatedBirthProfileUpsertRequest) => Promise<unknown>;
  readonly onSave: (
    relatedProfileId: string,
    input: ClientRelatedBirthProfileUpsertRequest
  ) => Promise<unknown>;
};

type EditingTarget =
  | { readonly kind: "create" }
  | { readonly kind: "update"; readonly profile: ClientRelatedBirthProfileResponse };

export function ClientCrmRelatedProfilesPanel({
  copy,
  profiles,
  locale,
  isSaving,
  isError,
  onCreate,
  onSave
}: ClientCrmRelatedProfilesPanelProps) {
  const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null);

  useEffect(() => {
    setEditingTarget(null);
  }, [profiles]);

  return (
    <div className={styles.overviewGrid}>
      <section className={styles.card}>
        <div className={styles.crmCardHeader}>
          <div className={styles.kicker}>{copy.tabs.relatedProfiles}</div>
          {!editingTarget ? (
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setEditingTarget({ kind: "create" })}
            >
              <Icon iconName="plus" size={15} aria-hidden="true" />
              {copy.relatedProfilesEditor.addLabel}
            </button>
          ) : null}
        </div>

        {editingTarget ? (
          <RelatedProfileForm
            copy={copy}
            target={editingTarget}
            isSaving={isSaving}
            isError={isError}
            onCancel={() => setEditingTarget(null)}
            onSubmit={async (input) => {
              if (editingTarget.kind === "create") {
                await onCreate(input);
              } else {
                await onSave(editingTarget.profile.id, input);
              }
              setEditingTarget(null);
            }}
          />
        ) : profiles.length === 0 ? (
          <div className={styles.emptyStateCompact}>{copy.emptyRelatedProfiles}</div>
        ) : null}
      </section>

      {profiles.map((profile) => (
        <section className={styles.card} key={profile.id}>
          <div className={styles.crmCardHeader}>
            <div className={styles.sectionHeader}>
              <ClientCrmAvatar name={profile.displayName} size={38} />
              <div>
                <div className={styles.activityTitle}>{profile.displayName}</div>
                <div className={styles.activityMeta}>{profile.relationshipLabel}</div>
              </div>
            </div>
            {!editingTarget ? (
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setEditingTarget({ kind: "update", profile })}
              >
                <Icon iconName="edit" size={15} aria-hidden="true" />
                {copy.relatedProfilesEditor.editLabel(profile.displayName)}
              </button>
            ) : null}
          </div>
          <div className={styles.factList}>
            <Fact label={copy.facts.birthData} value={profile.birthDate ?? copy.missingBirthData} />
            <Fact
              label={copy.facts.birthTime}
              value={
                profile.birthTime
                  ? `${profile.birthTime} · ${profile.birthTimePrecision}`
                  : profile.birthTimePrecision
              }
            />
            <Fact label={copy.facts.place} value={profile.birthPlaceText ?? "-"} />
            <Fact label={copy.facts.timezone} value={profile.birthTimezone ?? "-"} />
            <Fact label={copy.facts.revision} value={String(profile.revision)} />
            <Fact
              label={copy.facts.updatedAt}
              value={formatClientCrmDate(profile.updatedAt, locale)}
            />
          </div>
        </section>
      ))}
    </div>
  );
}

function RelatedProfileForm({
  copy,
  target,
  isSaving,
  isError,
  onCancel,
  onSubmit
}: {
  readonly copy: ClientsCrmCopy;
  readonly target: EditingTarget;
  readonly isSaving: boolean;
  readonly isError: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (input: ClientRelatedBirthProfileUpsertRequest) => Promise<void>;
}) {
  const profile = target.kind === "update" ? target.profile : null;
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [relationshipLabel, setRelationshipLabel] = useState(profile?.relationshipLabel ?? "");
  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? "");
  const [birthTime, setBirthTime] = useState(profile?.birthTime ?? "");
  const [birthTimePrecision, setBirthTimePrecision] = useState<BirthTimePrecision>(
    profile?.birthTimePrecision ?? "unknown"
  );
  const [birthPlaceText, setBirthPlaceText] = useState(profile?.birthPlaceText ?? "");
  const [birthTimezone, setBirthTimezone] = useState(profile?.birthTimezone ?? "");

  const submit = () =>
    onSubmit({
      displayName,
      relationshipLabel,
      label: null,
      birthDate,
      birthTime: birthTimePrecision === "unknown" ? null : birthTime,
      birthTimePrecision,
      birthPlaceText,
      birthCountryCode: profile?.birthCountryCode ?? null,
      birthCity: profile?.birthCity ?? null,
      birthRegion: profile?.birthRegion ?? null,
      birthTimezone,
      birthTimeDstOccurrence: profile?.birthTimeDstOccurrence ?? null,
      birthLatitude: profile?.birthLatitude ?? null,
      birthLongitude: profile?.birthLongitude ?? null,
      expectedRevision: profile?.revision ?? null
    });

  return (
    <div className={styles.crmEditor}>
      <label className={styles.fieldLabel}>
        <span>{copy.relatedProfilesEditor.displayNameLabel}</span>
        <input
          aria-label={copy.relatedProfilesEditor.displayNameLabel}
          className={styles.input}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </label>
      <label className={styles.fieldLabel}>
        <span>{copy.relatedProfilesEditor.relationshipLabel}</span>
        <input
          aria-label={copy.relatedProfilesEditor.relationshipLabel}
          className={styles.input}
          value={relationshipLabel}
          onChange={(event) => setRelationshipLabel(event.target.value)}
        />
      </label>
      <BirthProfileFields
        copy={copy}
        birthDate={birthDate}
        birthTime={birthTime}
        birthTimePrecision={birthTimePrecision}
        birthPlaceText={birthPlaceText}
        birthTimezone={birthTimezone}
        onBirthDateChange={setBirthDate}
        onBirthTimeChange={setBirthTime}
        onBirthTimePrecisionChange={setBirthTimePrecision}
        onBirthPlaceTextChange={setBirthPlaceText}
        onBirthTimezoneChange={setBirthTimezone}
      >
        {isError ? (
          <div className={styles.inlineError}>{copy.relatedProfilesEditor.saveError}</div>
        ) : null}
        <div className={styles.editorActions}>
          <button type="button" className={styles.button} onClick={submit} disabled={isSaving}>
            <Icon iconName="check" size={15} aria-hidden="true" />
            {isSaving
              ? copy.relatedProfilesEditor.savingLabel
              : copy.relatedProfilesEditor.saveLabel}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCancel}
            disabled={isSaving}
          >
            {copy.relatedProfilesEditor.cancelLabel}
          </button>
        </div>
      </BirthProfileFields>
    </div>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className={styles.factRow}>
      <span className={styles.factLabel}>{label}</span>
      <span className={styles.factValue}>{value}</span>
    </div>
  );
}
