import type { FlowDefinitionTemplateDescriptorV2, ProductResponse } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export type FlowCreateDialogProps = {
  readonly templates: readonly FlowDefinitionTemplateDescriptorV2[];
  readonly products?: readonly ProductResponse[];
  readonly locale: "ru" | "en";
  readonly open: boolean;
  readonly creationAllowed?: boolean;
  readonly pending: boolean;
  readonly loading?: boolean;
  readonly error?: Error | null;
  readonly requestedTemplateKey?: string | null;
  readonly onClose: () => void;
  readonly onCreateTemplate: (
    template: FlowDefinitionTemplateDescriptorV2,
    parameters: Record<string, string[]>
  ) => void;
  readonly onCreateBlank: () => void;
  readonly onRetry?: () => void;
  readonly classNames?: Readonly<Record<string, string>>;
};

const copyByLocale = {
  ru: {
    title: "Новый сценарий",
    close: "Закрыть",
    intro: "Выберите готовый сценарий или начните с пустого.",
    templatesTitle: "Готовые сценарии",
    blank: "Начать с пустого сценария",
    available: "Доступен к созданию",
    tariffUnavailable: "Текущий тариф не позволяет создавать воронки.",
    recommended: "Рекомендовано интеграцией",
    capabilityUnavailable: "Необходимые возможности пока недоступны.",
    legacyReadOnly:
      "Этот legacy-сценарий доступен только для чтения до миграции в актуальный формат.",
    unavailable: "Этот сценарий пока недоступен для создания.",
    requestedAvailable: (name: string) => `Интеграция рекомендует сценарий «${name}».`,
    requestedUnavailable: (name: string) =>
      `Сценарий «${name}», запрошенный интеграцией, пока нельзя создать.`,
    requestedMissing:
      "Запрошенный интеграцией сценарий отсутствует в текущем каталоге и не может быть создан.",
    loading: "Загружаем каталог сценариев.",
    retry: "Повторить загрузку",
    selectProducts: "Выберите услуги для этого сценария",
    noEligibleProducts: "Нет активных услуг с натальной картой и данными chart1."
  },
  en: {
    title: "New flow",
    close: "Close",
    intro: "Choose a ready-made flow or start from blank.",
    templatesTitle: "Ready-made flows",
    blank: "Start with a blank flow",
    available: "Available to create",
    tariffUnavailable: "Your current plan does not allow creating flows.",
    recommended: "Recommended by integration",
    capabilityUnavailable: "Required capabilities are not available yet.",
    legacyReadOnly: "This legacy flow is read-only until it is migrated to the current format.",
    unavailable: "This flow is not available for creation yet.",
    requestedAvailable: (name: string) => `The integration recommends the “${name}” flow.`,
    requestedUnavailable: (name: string) =>
      `The integration-requested flow “${name}” cannot be created yet.`,
    requestedMissing:
      "The integration-requested flow is not present in the current catalog and cannot be created.",
    loading: "Loading the flow catalog.",
    retry: "Retry loading",
    selectProducts: "Select services for this flow",
    noEligibleProducts: "No active services require a natal chart with chart1 data."
  }
} as const;

export function FlowCreateDialog({
  templates,
  products = [],
  locale,
  open,
  creationAllowed = true,
  pending,
  loading = false,
  error = null,
  requestedTemplateKey,
  onClose,
  onCreateTemplate,
  onCreateBlank,
  onRetry,
  classNames
}: FlowCreateDialogProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<readonly string[]>([]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const firstFocusable = getFocusableElements(dialogRef.current)[0];
    (firstFocusable ?? dialogRef.current)?.focus();

    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const copy = copyByLocale[locale];
  const titleId = `${id}-title`;
  const introId = `${id}-intro`;
  const templatesTitleId = `${id}-templates-title`;
  const requestedTemplate = requestedTemplateKey
    ? templates.find((template) => template.key === requestedTemplateKey)
    : undefined;
  const requestedNotice = loading
    ? copy.loading
    : error
      ? null
      : requestedTemplateKey
        ? requestedTemplate
          ? requestedTemplate.availability === "available"
            ? copy.requestedAvailable(requestedTemplate.name)
            : `${copy.requestedUnavailable(requestedTemplate.name)} ${getBlockerReason(
                requestedTemplate,
                locale
              )}`
          : copy.requestedMissing
        : null;
  const className = (key: string) => classNames?.[key] ?? "";
  const eligibleProducts = products.filter(
    (product) =>
      product.methods.includes("natal") &&
      product.requiredClientData.includes("chart1") &&
      !product.requiredClientData.includes("chart2")
  );

  return (
    <div
      className={className("createDialogBackdrop")}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={className("createDialog")}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={introId}
        aria-busy={pending || loading}
        onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onClose)}
      >
        <header className={className("createDialogHeader")}>
          <h2 id={titleId}>{copy.title}</h2>
          <button
            className={className("createDialogClose")}
            type="button"
            aria-label={copy.close}
            onClick={onClose}
          >
            <Icon iconName="close" width={18} height={18} aria-hidden="true" />
          </button>
        </header>

        <p id={introId} className={className("createDialogIntro")}>
          {copy.intro}
        </p>

        {requestedNotice ? (
          <p className={className("createDialogNotice")} role="status">
            {requestedNotice}
          </p>
        ) : null}

        {!creationAllowed ? (
          <p className={className("createDialogNotice")} role="status">
            {copy.tariffUnavailable}
          </p>
        ) : null}

        {error ? (
          <div className={className("createDialogError")} role="alert">
            <p>{error.message}</p>
            {onRetry ? (
              <button type="button" onClick={onRetry}>
                <Icon iconName="refresh" width={15} height={15} aria-hidden="true" />
                {copy.retry}
              </button>
            ) : null}
          </div>
        ) : null}

        <section className={className("createDialogSection")} aria-labelledby={templatesTitleId}>
          <h3 id={templatesTitleId}>{copy.templatesTitle}</h3>
          {loading && !requestedTemplateKey ? (
            <p className={className("createDialogNotice")} role="status">
              {copy.loading}
            </p>
          ) : null}
          <ul className={className("createDialogList")}>
            {templates.map((template, index) => {
              const available = template.availability === "available" && creationAllowed;
              const requiresProducts = template.parameters.some(
                (parameter) => parameter.kind === "product_ids" && parameter.required
              );
              const selected = selectedProductIds.filter((id) =>
                eligibleProducts.some((product) => product.id === id)
              );
              const recommended = available && template.key === requestedTemplateKey;
              const descriptionId = `${id}-template-${index}-description`;
              const metaId = `${id}-template-${index}-meta`;
              const meta = available
                ? recommended
                  ? copy.recommended
                  : copy.available
                : getBlockerReason(template, locale);

              return (
                <li key={`${template.key}:${template.version}`}>
                  <button
                    className={className("createDialogTemplate")}
                    type="button"
                    disabled={
                      !available ||
                      pending ||
                      loading ||
                      (requiresProducts && (eligibleProducts.length === 0 || selected.length === 0))
                    }
                    aria-describedby={`${descriptionId} ${metaId}`}
                    data-recommended={recommended ? "true" : undefined}
                    onClick={() =>
                      onCreateTemplate(
                        template,
                        requiresProducts ? { product_ids: [...selected] } : {}
                      )
                    }
                  >
                    <span className={className("createDialogTemplateIcon")} aria-hidden="true">
                      <Icon iconName="flow" width={19} height={19} />
                    </span>
                    <span className={className("createDialogTemplateCopy")}>
                      <span>{template.name}</span>
                      <span id={descriptionId}>{template.description}</span>
                      <span id={metaId} className={className("createDialogTemplateMeta")}>
                        {meta}
                      </span>
                    </span>
                  </button>
                  {requiresProducts ? (
                    eligibleProducts.length === 0 ? (
                      <p className={className("createDialogProductHint")}>
                        {copy.noEligibleProducts}
                      </p>
                    ) : (
                      <label className={className("createDialogProductSelect")}>
                        <span>{copy.selectProducts}</span>
                        <select
                          multiple
                          value={selected}
                          onChange={(event) =>
                            setSelectedProductIds(
                              Array.from(
                                event.currentTarget.selectedOptions,
                                (option) => option.value
                              )
                            )
                          }
                        >
                          {eligibleProducts.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>

          <button
            className={className("createDialogBlank")}
            type="button"
            disabled={pending || !creationAllowed}
            onClick={onCreateBlank}
          >
            <Icon iconName="plus" width={16} height={16} aria-hidden="true" />
            <span>{copy.blank}</span>
          </button>
        </section>
      </div>
    </div>
  );
}

function handleDialogKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  dialog: HTMLDivElement | null,
  onClose: () => void
) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    onClose();
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = getFocusableElements(dialog);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) {
    event.preventDefault();
    dialog?.focus();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function getFocusableElements(dialog: HTMLDivElement | null): HTMLElement[] {
  return dialog
    ? Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )
      )
    : [];
}

function getBlockerReason(
  template: FlowDefinitionTemplateDescriptorV2,
  locale: FlowCreateDialogProps["locale"]
) {
  const copy = copyByLocale[locale];

  if (template.blockerCode === "FLOW_TEMPLATE_CAPABILITY_UNAVAILABLE") {
    return copy.capabilityUnavailable;
  }

  if (template.blockerCode === "FLOW_TEMPLATE_LEGACY_GRAPH_ONLY") {
    return copy.legacyReadOnly;
  }

  return template.availability === "legacy_read_only" ? copy.legacyReadOnly : copy.unavailable;
}
