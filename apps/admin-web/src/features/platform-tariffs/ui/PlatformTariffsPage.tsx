import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Card } from "@elevenhouse/design-system/components/Card";
import "@elevenhouse/design-system/components/Card.css";
import { Check } from "@elevenhouse/design-system/icons/Check";
import { Edit } from "@elevenhouse/design-system/icons/Edit";
import { Plus } from "@elevenhouse/design-system/icons/Plus";
import type { AdminTariffResponse } from "@elevenhouse/contracts";
import {
  AdminPlatformTariffsApiError,
  createAdminPlatformTariffsApi,
  type AdminPlatformTariffsApi
} from "../api/adminPlatformTariffsApi";
import {
  createBlankTariffDraft,
  createNextVersionDraft,
  nextTariffVersion,
  platformTariffFeatureOptions,
  tariffToForm,
  toUpdateRequest,
  toggleTariffFeature,
  type PlatformTariffFormState
} from "../model/platformTariffFormModel";
import "./PlatformTariffsPage.css";

export type PlatformTariffsPageProps = {
  readonly api?: AdminPlatformTariffsApi;
};

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly tariffs: readonly AdminTariffResponse[] };

type EditorState =
  | { readonly kind: "create"; readonly form: PlatformTariffFormState }
  | { readonly kind: "edit"; readonly tariff: AdminTariffResponse; readonly form: PlatformTariffFormState }
  | null;

export function PlatformTariffsPage({ api: providedApi }: PlatformTariffsPageProps) {
  const defaultApi = useMemo(() => createAdminPlatformTariffsApi(), []);
  const api = providedApi ?? defaultApi;
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [editor, setEditor] = useState<EditorState>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const tariffs = loadState.status === "ready" ? loadState.tariffs : [];
  const refresh = useCallback(async () => {
    setLoadState({ status: "loading" });
    try {
      const result = await api.listTariffs();
      setLoadState({ status: "ready", tariffs: result.tariffs });
    } catch (error) {
      setLoadState({ status: "error", message: errorMessage(error) });
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openNew = () => {
    setNotice(null);
    setSubmitError(null);
    setEditor({ kind: "create", form: createBlankTariffDraft(tariffs.length) });
  };

  const openVersion = (tariff: AdminTariffResponse) => {
    setNotice(null);
    setSubmitError(null);
    setEditor({
      kind: "create",
      form: createNextVersionDraft(tariff, nextTariffVersion(tariffs, tariff.tariffSeriesId))
    });
  };

  const openEdit = (tariff: AdminTariffResponse) => {
    setNotice(null);
    setSubmitError(null);
    setEditor({ kind: "edit", tariff, form: tariffToForm(tariff) });
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    setSubmitError(null);
    try {
      const idempotencyKey = newTariffCommandKey();
      const tariff = editor.kind === "create"
        ? await api.createDraft(editor.form, idempotencyKey)
        : await api.updateDraft(toUpdateRequest(editor.form, editor.tariff.draftRevision), idempotencyKey);
      setEditor(null);
      setNotice(`Черновик ${tariff.tariffSeriesId} v${tariff.version} сохранён.`);
      await refresh();
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const publish = async (tariff: AdminTariffResponse) => {
    setSaving(true);
    setSubmitError(null);
    try {
      const published = await api.publishDraft(
        tariff.tariffSeriesId,
        tariff.version,
        tariff.draftRevision,
        newTariffCommandKey()
      );
      setNotice(`Тариф ${published.name} v${published.version} опубликован.`);
      await refresh();
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="adminTariffsShell">
      <header className="adminTariffsHeader">
        <div>
          <p>PLATFORM BILLING</p>
          <h1>Тарифы</h1>
          <span>Версии, комиссия с продажи и доступ к возможностям ElevenHouse.</span>
        </div>
        <div className="adminTariffsHeaderActions">
          <a href="?section=finance">Финансы</a>
          <Button title="Новый тариф" variant="brand" startIcon={<Plus />} onClick={openNew} />
        </div>
      </header>

      <section className="adminTariffsNotice" aria-live="polite">
        <p>Опубликованная версия неизменяема. Для новых условий создайте следующий черновик версии.</p>
        {notice ? <div className="adminTariffsSuccess">{notice}</div> : null}
        {submitError ? <div className="adminTariffsError" role="alert">{submitError}</div> : null}
      </section>

      {loadState.status === "loading" ? <p className="adminTariffsState">Загружаем тарифы…</p> : null}
      {loadState.status === "error" ? (
        <section className="adminTariffsState" role="alert">
          <p>{loadState.message}</p>
          <Button title="Повторить" variant="default" onClick={() => void refresh()} />
        </section>
      ) : null}
      {loadState.status === "ready" ? (
        <section className="adminTariffsGrid" aria-label="Версии тарифов">
          {tariffs.length === 0 ? <p className="adminTariffsState">Тарифов ещё нет.</p> : null}
          {tariffs.map((tariff) => (
            <TariffCard
              key={`${tariff.tariffSeriesId}:${tariff.version}`}
              tariff={tariff}
              saving={saving}
              onEdit={openEdit}
              onCreateVersion={openVersion}
              onPublish={publish}
            />
          ))}
        </section>
      ) : null}

      {editor ? (
        <TariffEditor
          editor={editor}
          saving={saving}
          error={submitError}
          onClose={() => setEditor(null)}
          onChange={(form) => setEditor((current) => current ? { ...current, form } : null)}
          onSubmit={save}
        />
      ) : null}
    </main>
  );
}

function TariffCard(props: {
  readonly tariff: AdminTariffResponse;
  readonly saving: boolean;
  readonly onEdit: (tariff: AdminTariffResponse) => void;
  readonly onCreateVersion: (tariff: AdminTariffResponse) => void;
  readonly onPublish: (tariff: AdminTariffResponse) => void;
}) {
  const { tariff } = props;
  const isDraft = tariff.lifecycle === "draft";
  return (
    <Card className="adminTariffCard" padding="small">
      <div className={`adminTariffLifecycle adminTariffLifecycle--${tariff.lifecycle}`}>
        {lifecycleLabel(tariff.lifecycle)}
      </div>
      <div className="adminTariffCardBody">
        <div className="adminTariffCardHead">
          <div>
            <h2>{tariff.name}</h2>
            <p>{tariff.tagline}</p>
          </div>
          <span>v{tariff.version}</span>
        </div>
        <strong>{formatRubles(tariff.monthlyPriceMinor)}<small>/ мес.</small></strong>
        <dl>
          <div><dt>Комиссия</dt><dd>{formatBps(tariff.clientSaleCommissionBps)}</dd></div>
          <div><dt>Мест</dt><dd>{formatLimit(tariff.seatsLimit)}</dd></div>
          <div><dt>Возможностей</dt><dd>{tariff.features.length}</dd></div>
        </dl>
        <div className="adminTariffFeatures">
          {tariff.features.slice(0, 6).map((feature) => <span key={feature}>{feature}</span>)}
          {tariff.features.length > 6 ? <span>+{tariff.features.length - 6}</span> : null}
        </div>
        <div className="adminTariffActions">
          {isDraft ? (
            <>
              <Button title="Изменить" variant="default" size="small" startIcon={<Edit />} disabled={props.saving} onClick={() => props.onEdit(tariff)} />
              <Button title="Опубликовать" variant="brand" size="small" startIcon={<Check />} disabled={props.saving} onClick={() => void props.onPublish(tariff)} />
            </>
          ) : (
            <Button title={`Создать v${tariff.version + 1}`} variant="default" size="small" startIcon={<Plus />} disabled={props.saving} onClick={() => props.onCreateVersion(tariff)} />
          )}
        </div>
      </div>
    </Card>
  );
}

function TariffEditor(props: {
  readonly editor: Exclude<EditorState, null>;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onChange: (form: PlatformTariffFormState) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const form = props.editor.form;
  const update = <Key extends keyof PlatformTariffFormState>(key: Key, value: PlatformTariffFormState[Key]) =>
    props.onChange({ ...form, [key]: value });
  const updateInteger = (key: keyof PlatformTariffFormState, value: string, nullable = false) => {
    const normalized = value.trim();
    update(key, (nullable && normalized === "" ? null : Number(normalized)) as PlatformTariffFormState[typeof key]);
  };
  return (
    <div className="adminTariffDialogBackdrop" role="presentation" onMouseDown={props.onClose}>
      <form className="adminTariffDialog" role="dialog" aria-modal="true" aria-labelledby="tariff-editor-title" onSubmit={props.onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p>{props.editor.kind === "edit" ? "DRAFT REVISION" : "NEW TARIFF VERSION"}</p>
            <h2 id="tariff-editor-title">{props.editor.kind === "edit" ? "Изменить черновик" : "Новый черновик"}</h2>
          </div>
          <button type="button" className="adminTariffClose" aria-label="Закрыть" onClick={props.onClose}>×</button>
        </header>
        <div className="adminTariffFormGrid">
          <Field label="ID серии" name="tariffSeriesId" value={form.tariffSeriesId} onChange={(value) => update("tariffSeriesId", value)} disabled={props.editor.kind === "edit"} />
          <NumberField label="Версия" name="version" value={form.version} min={1} onChange={(value) => updateInteger("version", value)} disabled={props.editor.kind === "edit"} />
          <Field label="Название" name="name" value={form.name} onChange={(value) => update("name", value)} />
          <Field label="Подзаголовок" name="tagline" value={form.tagline} onChange={(value) => update("tagline", value)} />
          <NumberField label="Цена / месяц, коп." name="monthlyPriceMinor" value={form.monthlyPriceMinor} min={0} onChange={(value) => {
            const monthlyPriceMinor = Number(value);
            props.onChange({
              ...form,
              monthlyPriceMinor,
              monthlyRecurringFrequencyDays: monthlyPriceMinor === 0
                ? null
                : (form.monthlyRecurringFrequencyDays ?? 31)
            });
          }} />
          <NumberField label="Период месяца, дней" name="monthlyRecurringFrequencyDays" value={form.monthlyRecurringFrequencyDays ?? ""} min={1} max={366} disabled={form.monthlyPriceMinor === 0} onChange={(value) => updateInteger("monthlyRecurringFrequencyDays", value, true)} />
          <NumberField label="Цена / год, коп." name="yearlyPriceMinor" value={form.yearlyPriceMinor} min={0} onChange={(value) => {
            const yearlyPriceMinor = Number(value);
            props.onChange({
              ...form,
              yearlyPriceMinor,
              yearlyRecurringFrequencyDays: yearlyPriceMinor === 0
                ? null
                : (form.yearlyRecurringFrequencyDays ?? 365)
            });
          }} />
          <NumberField label="Период года, дней" name="yearlyRecurringFrequencyDays" value={form.yearlyRecurringFrequencyDays ?? ""} min={1} max={366} disabled={form.yearlyPriceMinor === 0} onChange={(value) => updateInteger("yearlyRecurringFrequencyDays", value, true)} />
          <NumberField label="Комиссия, bps" name="clientSaleCommissionBps" value={form.clientSaleCommissionBps} min={0} max={10000} onChange={(value) => updateInteger("clientSaleCommissionBps", value)} />
          <NumberField label="Порядок показа" name="displayOrder" value={form.displayOrder} min={0} onChange={(value) => updateInteger("displayOrder", value)} />
          <NumberField label="Мест (пусто = без лимита)" name="seatsLimit" value={form.seatsLimit ?? ""} min={1} onChange={(value) => updateInteger("seatsLimit", value, true)} />
          <NumberField label="Записей (пусто = без лимита)" name="bookingsLimit" value={form.bookingsLimit ?? ""} min={1} onChange={(value) => updateInteger("bookingsLimit", value, true)} />
          <NumberField label="AI-запросов (пусто = без лимита)" name="aiRequestsLimit" value={form.aiRequestsLimit ?? ""} min={1} onChange={(value) => updateInteger("aiRequestsLimit", value, true)} />
          <NumberField label="Автоматизаций (пусто = без лимита)" name="automationLimit" value={form.automationLimit ?? ""} min={1} onChange={(value) => updateInteger("automationLimit", value, true)} />
        </div>
        <label className="adminTariffPopular"><input type="checkbox" checked={form.isPopular} onChange={(event) => update("isPopular", event.target.checked)} /> Отметить как популярный</label>
        <fieldset className="adminTariffFeatureFieldset">
          <legend>Возможности тарифа</legend>
          <p>Публикация дополнительно проверит, что каждая выбранная возможность и её ограничения реально подключены.</p>
          <div>
            {platformTariffFeatureOptions.map((feature) => (
              <label key={feature}>
                <input type="checkbox" checked={form.features.includes(feature)} onChange={() => update("features", toggleTariffFeature(form.features, feature))} />
                {feature}
              </label>
            ))}
          </div>
        </fieldset>
        {props.error ? <p className="adminTariffsError" role="alert">{props.error}</p> : null}
        <footer>
          <Button title="Отмена" variant="default" type="button" onClick={props.onClose} />
          <Button title="Сохранить черновик" variant="brand" type="submit" disabled={props.saving} />
        </footer>
      </form>
    </div>
  );
}

function Field(props: { readonly label: string; readonly name: string; readonly value: string; readonly onChange: (value: string) => void; readonly disabled?: boolean }) {
  return <label className="adminTariffField">{props.label}<input name={props.name} value={props.value} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value)} required /></label>;
}

function NumberField(props: { readonly label: string; readonly name: string; readonly value: number | ""; readonly min: number; readonly max?: number; readonly onChange: (value: string) => void; readonly disabled?: boolean }) {
  return <label className="adminTariffField">{props.label}<input name={props.name} type="number" value={props.value} min={props.min} max={props.max} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value)} /></label>;
}

function newTariffCommandKey(): string {
  const key = globalThis.crypto?.randomUUID?.();
  if (!key) throw new Error("Secure browser idempotency key generation is unavailable");
  return `admin-tariff:${key}`;
}

function lifecycleLabel(value: AdminTariffResponse["lifecycle"]): string {
  return value === "draft" ? "Черновик" : value === "published" ? "Опубликован" : "Архив";
}

function formatRubles(amountMinor: number): string {
  return `${(amountMinor / 100).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`;
}

function formatBps(value: number): string {
  return `${(value / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
}

function formatLimit(value: number | null): string {
  return value === null ? "∞" : String(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof AdminPlatformTariffsApiError) {
    const message = error.responseBody && typeof error.responseBody === "object" && "message" in error.responseBody
      ? (error.responseBody as { message?: unknown }).message
      : null;
    if (typeof message === "string" && message) return message;
    if (error.status === 403) return "CSRF или сессия администратора недействительны. Обновите страницу и повторите действие.";
    if (error.status === 409) return "Черновик уже изменён другим оператором. Обновите тарифы и повторите действие.";
  }
  return error instanceof Error ? error.message : "Не удалось выполнить операцию с тарифом.";
}
