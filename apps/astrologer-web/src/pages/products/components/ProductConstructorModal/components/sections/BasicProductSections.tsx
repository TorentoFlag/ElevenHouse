import type {
  ProductAccessGrant,
  ProductDeliveryFormat,
  ProductExecutionMode,
  ProductMethod,
  ProductParticipantMode,
  ProductPaymentModel,
  ProductRequiredClientData,
  ProductSubscriptionPeriod
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { NumberStepper } from "@elevenhouse/design-system/components/NumberStepper";
import "@elevenhouse/design-system/components/NumberStepper.css";
import {
  productAccessGrantOptions,
  productDeliveryFormatOptions,
  productExecutionModeOptions,
  productMethodOptions,
  productParticipantModeOptions,
  productPaymentModelOptions,
  productRequiredClientDataOptions,
  productSubscriptionPeriodOptions
} from "../../../../../../features/products/model/productConstructorOptions";
import {
  formatDurationLabel,
  majorValueToMinor,
  minorToMajorValue
} from "../../../../../../features/products/model/productConstructorViewModel";
import type { ProductConstructorSectionProps } from "../../types";
import { ConstructorOptionGroup, LabeledStepper, SectionHeading } from "../ConstructorPrimitives";
import styles from "../../ProductConstructorModal.module.css";

export type BasicProductSectionId =
  | "media"
  | "basics"
  | "format"
  | "execution"
  | "payment"
  | "duration"
  | "participants";

type PaymentSectionMode = "all" | "package" | "subscription";

type BasicProductSectionsProps = ProductConstructorSectionProps & {
  readonly visibleSections?: readonly BasicProductSectionId[];
  readonly paymentSectionMode?: PaymentSectionMode;
  readonly durationTitle?: string;
  readonly durationHint?: string;
};

export function BasicProductSections({
  copy,
  productCopy,
  locale,
  draft,
  controller,
  isCoverUploading,
  coverMediaUrl,
  coverUploadError,
  onCoverFileSelected,
  onCoverRemove,
  visibleSections,
  paymentSectionMode = "all",
  durationTitle,
  durationHint
}: BasicProductSectionsProps) {
  const { uiCopy, actions } = controller;
  const isVisible = (section: BasicProductSectionId) =>
    !visibleSections || visibleSections.includes(section);

  return (
    <>
      {isVisible("media") ? (
        <section
          className={styles.constructorSectionPlain}
          aria-labelledby="product-constructor-media"
        >
          <SectionHeading
            id="product-constructor-media"
            title={uiCopy.mediaLabel}
            hint={uiCopy.mediaHint}
          />
          <div className={styles.constructorMediaRow}>
            <label
              className={styles.constructorCoverDropzone}
              data-product-constructor-cover-dropzone="true"
              data-uploading={isCoverUploading ? "true" : undefined}
              aria-label={uiCopy.coverPlaceholder}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) {
                  void onCoverFileSelected(file);
                }
              }}
            >
              {coverMediaUrl ? (
                <>
                  <img src={coverMediaUrl} alt="" className={styles.constructorCoverImage} />
                  <button
                    className={styles.constructorCoverRemoveButton}
                    type="button"
                    aria-label={uiCopy.removeCoverLabel}
                    disabled={isCoverUploading}
                    onClick={(event) => {
                      event.preventDefault();
                      onCoverRemove();
                    }}
                  >
                    <Icon iconName="close" width={14} height={14} aria-hidden="true" />
                  </button>
                </>
              ) : (
                <>
                  <Icon iconName="image" width={34} height={34} aria-hidden="true" />
                  <span>{isCoverUploading ? copy.savingLabel : uiCopy.coverPlaceholder}</span>
                </>
              )}
              <input
                className={styles.constructorFileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                disabled={isCoverUploading}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) {
                    void onCoverFileSelected(file);
                  }
                }}
              />
            </label>
            <div className={styles.constructorMediaFields}>
              <label className={styles.constructorInputShell}>
                <Icon iconName="video" width={17} height={17} aria-hidden="true" />
                <input
                  className={styles.constructorInputBare}
                  value={draft.introVideoUrl}
                  placeholder={uiCopy.introVideoPlaceholder}
                  onChange={(event) =>
                    actions.updateDraft({ introVideoUrl: event.currentTarget.value })
                  }
                />
              </label>
              <p className={styles.constructorHint}>
                {coverUploadError ? coverUploadError : uiCopy.introVideoHint}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {isVisible("basics") ? (
        <section
          className={styles.constructorSectionPlain}
          aria-labelledby="product-constructor-title"
        >
          <SectionHeading id="product-constructor-title" title={uiCopy.nameAndPriceLabel} />
          <div className={styles.constructorFieldsGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{copy.titleLabel}</span>
              <input
                className={styles.textInput}
                data-product-constructor-title="true"
                value={draft.title}
                placeholder={copy.titlePlaceholder}
                autoFocus
                onChange={(event) => actions.updateDraft({ title: event.currentTarget.value })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{copy.priceLabel}</span>
              <span className={styles.constructorPriceInputShell}>
                <input
                  className={`${styles.textInput} ${styles.constructorPriceInput}`}
                  inputMode="numeric"
                  value={minorToMajorValue(draft.priceMinor)}
                  onChange={(event) =>
                    actions.updateDraft({
                      priceMinor: majorValueToMinor(event.currentTarget.value)
                    })
                  }
                />
                <span aria-hidden="true">₽</span>
              </span>
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{copy.subtitleLabel}</span>
            <input
              className={styles.textInput}
              value={draft.subtitle}
              placeholder={copy.subtitlePlaceholder}
              onChange={(event) => actions.updateDraft({ subtitle: event.currentTarget.value })}
            />
          </label>
        </section>
      ) : null}

      {isVisible("format") ? (
        <section
          className={styles.constructorSectionPlain}
          aria-labelledby="product-constructor-format"
        >
          <SectionHeading id="product-constructor-format" title={copy.formatLabel} />
          <ConstructorOptionGroup<ProductDeliveryFormat>
            options={productDeliveryFormatOptions}
            selectedValues={draft.deliveryFormats}
            copyByValue={productCopy.deliveryFormats}
            onToggle={actions.toggleDeliveryFormat}
          />
        </section>
      ) : null}

      {isVisible("execution") ? (
        <section
          className={styles.constructorSectionPlain}
          aria-labelledby="product-constructor-execution"
        >
          <SectionHeading id="product-constructor-execution" title={uiCopy.whenLabel} />
          <ConstructorOptionGroup<ProductExecutionMode>
            options={productExecutionModeOptions}
            selectedValue={draft.executionMode}
            copyByValue={uiCopy.executionModes}
            onSelect={(value) => actions.updateDraft({ executionMode: value })}
          />
          {draft.executionMode === "async" ? (
            <input
              className={`${styles.textInput} ${styles.constructorShortInput}`}
              value={draft.slaLabel}
              placeholder={uiCopy.slaPlaceholder}
              onChange={(event) => actions.updateDraft({ slaLabel: event.currentTarget.value })}
            />
          ) : null}
        </section>
      ) : null}

      {isVisible("payment") ? (
        <PaymentSection
          copy={copy}
          productCopy={productCopy}
          locale={locale}
          draft={draft}
          controller={controller}
          isCoverUploading={isCoverUploading}
          coverMediaUrl={coverMediaUrl}
          coverUploadError={coverUploadError}
          onCoverFileSelected={onCoverFileSelected}
          onCoverRemove={onCoverRemove}
          mode={paymentSectionMode}
        />
      ) : null}
      {isVisible("duration") ? (
        <DurationSection
          copy={copy}
          productCopy={productCopy}
          locale={locale}
          draft={draft}
          controller={controller}
          isCoverUploading={isCoverUploading}
          coverMediaUrl={coverMediaUrl}
          coverUploadError={coverUploadError}
          onCoverFileSelected={onCoverFileSelected}
          onCoverRemove={onCoverRemove}
          title={durationTitle}
          hint={durationHint}
        />
      ) : null}
      {isVisible("participants") ? (
        <ParticipantsSection
          copy={copy}
          productCopy={productCopy}
          locale={locale}
          draft={draft}
          controller={controller}
          isCoverUploading={isCoverUploading}
          coverMediaUrl={coverMediaUrl}
          coverUploadError={coverUploadError}
          onCoverFileSelected={onCoverFileSelected}
          onCoverRemove={onCoverRemove}
        />
      ) : null}
    </>
  );
}

function PaymentSection({
  copy,
  productCopy,
  draft,
  controller,
  mode = "all"
}: ProductConstructorSectionProps & { readonly mode?: PaymentSectionMode }) {
  const { uiCopy, actions } = controller;
  const showPackageControls = mode === "package" || draft.paymentModel === "pack";
  const showSubscriptionControls = mode === "subscription" || draft.paymentModel === "sub";
  const isAstroDiary = draft.accessGrants.length === 1 && draft.accessGrants[0] === "journal";

  return (
    <section
      className={styles.constructorSectionPlain}
      aria-labelledby="product-constructor-payment"
    >
      <SectionHeading id="product-constructor-payment" title={copy.paymentModelLabel} />
      {mode === "all" ? (
        <ConstructorOptionGroup<ProductPaymentModel>
          options={productPaymentModelOptions}
          selectedValue={draft.paymentModel}
          copyByValue={uiCopy.paymentModels}
          onSelect={(value) => actions.updateDraft({ paymentModel: value })}
        />
      ) : null}
      {showPackageControls ? (
        <div className={styles.constructorInlineControls}>
          <LabeledStepper label={copy.packageSessionCountLabel}>
            <NumberStepper
              value={draft.packageSessionCount ?? 1}
              min={1}
              decrementLabel={copy.packageSessionCountLabel}
              incrementLabel={copy.packageSessionCountLabel}
              onValueChange={(value) => actions.updateDraft({ packageSessionCount: value })}
            />
          </LabeledStepper>
          <LabeledStepper label={copy.packageDiscountLabel}>
            <NumberStepper
              value={draft.packageDiscountPercent ?? 0}
              min={0}
              max={100}
              suffix="%"
              decrementLabel={copy.packageDiscountLabel}
              incrementLabel={copy.packageDiscountLabel}
              onValueChange={(value) => actions.updateDraft({ packageDiscountPercent: value })}
            />
          </LabeledStepper>
        </div>
      ) : null}
      {showSubscriptionControls ? (
        <div className={styles.constructorInlineControls}>
          <div className={styles.constructorNestedControl}>
            <span className={styles.fieldLabel}>{copy.subscriptionPeriodLabel}</span>
            <ConstructorOptionGroup<ProductSubscriptionPeriod>
              options={productSubscriptionPeriodOptions}
              selectedValue={draft.subscriptionPeriod ?? "month"}
              copyByValue={productCopy.subscriptionPeriods}
              onSelect={(value) => actions.updateDraft({ subscriptionPeriod: value })}
            />
          </div>
          {!isAstroDiary ? (
            <LabeledStepper label={copy.trialDaysLabel}>
              <NumberStepper
                value={draft.trialDays ?? 0}
                min={0}
                decrementLabel={copy.trialDaysLabel}
                incrementLabel={copy.trialDaysLabel}
                onValueChange={(value) => actions.updateDraft({ trialDays: value || null })}
              />
            </LabeledStepper>
          ) : null}
        </div>
      ) : null}
      {mode === "all" && draft.paymentModel === "free" ? (
        <p className={styles.constructorNote}>{uiCopy.freeNote}</p>
      ) : null}
    </section>
  );
}

function DurationSection({
  copy,
  draft,
  controller,
  title,
  hint
}: ProductConstructorSectionProps & { readonly title?: string; readonly hint?: string }) {
  const { uiCopy, actions } = controller;

  return (
    <section
      className={styles.constructorSectionPlain}
      aria-labelledby="product-constructor-duration"
    >
      <SectionHeading
        id="product-constructor-duration"
        title={title ?? uiCopy.volumeLabel}
        hint={hint ?? uiCopy.volumeHint}
      />
      <input
        className={`${styles.textInput} ${styles.constructorShortInput}`}
        value={draft.durationLabel || formatDurationLabel(draft, copy)}
        placeholder={uiCopy.durationPlaceholder}
        onChange={(event) => actions.updateDraft({ durationLabel: event.currentTarget.value })}
      />
    </section>
  );
}

function ParticipantsSection({
  copy,
  productCopy,
  draft,
  controller
}: ProductConstructorSectionProps) {
  const { actions } = controller;

  return (
    <section
      className={styles.constructorSectionPlain}
      aria-labelledby="product-constructor-participants"
    >
      <SectionHeading id="product-constructor-participants" title={copy.participantModeLabel} />
      <ConstructorOptionGroup<ProductParticipantMode>
        options={productParticipantModeOptions}
        selectedValue={draft.participantMode}
        copyByValue={productCopy.participantModes}
        onSelect={(value) => actions.updateDraft({ participantMode: value })}
      />
      {draft.participantMode === "group" ? (
        <LabeledStepper label={copy.groupSizeLabel}>
          <NumberStepper
            value={draft.groupSize ?? 2}
            min={2}
            decrementLabel={copy.groupSizeLabel}
            incrementLabel={copy.groupSizeLabel}
            onValueChange={(value) => actions.updateDraft({ groupSize: value })}
          />
        </LabeledStepper>
      ) : null}
    </section>
  );
}

export function MethodsSection({
  copy,
  productCopy,
  draft,
  controller
}: ProductConstructorSectionProps) {
  return (
    <section
      className={styles.constructorSectionPlain}
      aria-labelledby="product-constructor-methods"
    >
      <SectionHeading
        id="product-constructor-methods"
        title={copy.methodsLabel}
        hint={controller.uiCopy.methodHint}
      />
      <ConstructorOptionGroup<ProductMethod>
        options={productMethodOptions}
        selectedValues={draft.methods}
        copyByValue={productCopy.methods}
        onToggle={(value) => controller.actions.toggleArrayValue("methods", value)}
      />
    </section>
  );
}

export function ClientDataSection({
  copy,
  productCopy,
  draft,
  controller
}: ProductConstructorSectionProps) {
  return (
    <section
      className={styles.constructorSectionPlain}
      aria-labelledby="product-constructor-client-data"
    >
      <SectionHeading
        id="product-constructor-client-data"
        title={copy.requiredClientDataLabel}
        hint={controller.uiCopy.clientDataHint}
      />
      <ConstructorOptionGroup<ProductRequiredClientData>
        options={productRequiredClientDataOptions}
        selectedValues={draft.requiredClientData}
        copyByValue={productCopy.requiredClientData}
        onToggle={(value) => controller.actions.toggleArrayValue("requiredClientData", value)}
      />
    </section>
  );
}

export function AccessGrantsSection({
  copy,
  productCopy,
  draft,
  controller
}: ProductConstructorSectionProps) {
  return (
    <section
      className={styles.constructorSectionPlain}
      aria-labelledby="product-constructor-access"
    >
      <SectionHeading
        id="product-constructor-access"
        title={copy.accessGrantsLabel}
        hint={controller.uiCopy.accessHint}
      />
      <ConstructorOptionGroup<ProductAccessGrant>
        options={productAccessGrantOptions}
        selectedValues={draft.accessGrants}
        copyByValue={productCopy.accessGrants}
        onToggle={controller.actions.toggleAccessGrant}
      />
    </section>
  );
}
