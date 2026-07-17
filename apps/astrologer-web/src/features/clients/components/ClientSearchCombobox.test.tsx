import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ClientSearchComboboxView,
  type ClientSearchComboboxViewProps
} from "./ClientSearchComboboxView";

describe("ClientSearchComboboxView", () => {
  it("renders the reference-like trigger and closed state for the selected client", () => {
    const view = ClientSearchComboboxView({
      ...baseProps(),
      selectedClient: clientOption("Марина Краснова", "1990-03-14")
    });
    const trigger = findRequiredElement(
      view,
      (element) =>
        element.type === "button" &&
        (element.props as { role?: unknown }).role === "combobox"
    );

    expect((trigger.props as { "aria-expanded"?: unknown })["aria-expanded"]).toBe(false);
    expect(includesText(trigger.props, "Марина Краснова")).toBe(true);
    expect(includesText(trigger.props, "14.03.1990")).toBe(true);
    expect(
      findElements(view).some(
        (element) => (element.props as { role?: unknown }).role === "listbox"
      )
    ).toBe(false);
  });

  it("renders search listbox and forwards typed query and selected client", () => {
    const onSearchChange = vi.fn();
    const onSelect = vi.fn();
    const selectedClient = clientOption("Марина Краснова", "1990-03-14");
    const option = clientOption("Голубев Антон", "2000-08-19");
    const view = ClientSearchComboboxView({
      ...baseProps(),
      isOpen: true,
      selectedClient,
      clients: [selectedClient, option],
      searchQuery: "ант",
      activeClientId: option.value,
      onSearchChange,
      onSelect
    });
    const searchInput = findRequiredElement(
      view,
      (element) =>
        element.type === "input" &&
        (element.props as { role?: unknown }).role === "combobox"
    );
    const antonButton = findRequiredElement(
      view,
      (element) =>
        element.type === "button" &&
        (element.props as { role?: unknown }).role === "option" &&
        includesText(element.props, "Голубев Антон")
    );

    (searchInput.props as { onChange: (event: { target: { value: string } }) => void }).onChange({
      target: { value: "гол" }
    });
    (antonButton.props as { onClick: () => void }).onClick();

    expect(onSearchChange).toHaveBeenCalledWith("гол");
    expect(onSelect).toHaveBeenCalledWith(option);
    expect((antonButton.props as { "aria-selected"?: unknown })["aria-selected"]).toBe(false);
    expect((searchInput.props as { "aria-activedescendant"?: unknown })[
      "aria-activedescendant"
    ]).toContain(option.value);
  });

  it("shows infinite-scroll loading without adding a visual end-state row", () => {
    const loadingView = ClientSearchComboboxView({
      ...baseProps(),
      isOpen: true,
      clients: [clientOption("Марина Краснова", "1990-03-14")],
      hasNextPage: true,
      isFetchingNextPage: true
    });
    const endView = ClientSearchComboboxView({
      ...baseProps(),
      isOpen: true,
      clients: [clientOption("Марина Краснова", "1990-03-14")],
      hasNextPage: false,
      isFetchingNextPage: false
    });

    expect(includesText(loadingView.props, "Загружаем еще клиентов")).toBe(true);
    expect(includesText(endView.props, "Все найденные клиенты загружены")).toBe(false);
  });

  it("keeps the trigger shrink-safe inside dense toolbar rows", () => {
    const css = readFileSync(new URL("./ClientSearchCombobox.module.css", import.meta.url), "utf8");
    const rootRule = getCssRule(css, ".root");
    const triggerRule = getCssRule(css, ".trigger");

    expect(rootRule).toContain("flex: 1 1 204px;");
    expect(rootRule).toContain("max-width: 260px;");
    expect(triggerRule).toContain("width: 100%;");
    expect(triggerRule).toContain("min-width: 0;");
    expect(triggerRule).toContain("max-width: none;");
  });

  it("can select clients without birth data and expand to a modal field", () => {
    const onSelect = vi.fn();
    const withoutBirthDate = {
      ...clientOption("Новый Клиент", "2000-01-01"),
      hasBirthDate: false,
      birthData: null
    };
    const view = ClientSearchComboboxView({
      ...baseProps(),
      isOpen: true,
      clients: [withoutBirthDate],
      requireBirthDate: false,
      fullWidth: true,
      onSelect
    });
    const root = findRequiredElement(
      view,
      (element) =>
        element.type === "div" &&
        "data-full-width" in (element.props as Record<string, unknown>)
    );
    const option = findRequiredElement(
      view,
      (element) =>
        element.type === "button" && (element.props as { role?: unknown }).role === "option"
    );

    (option.props as { onClick: () => void }).onClick();

    expect((root.props as { "data-full-width"?: unknown })["data-full-width"]).toBe("true");
    expect((option.props as { disabled?: unknown }).disabled).toBe(false);
    expect(onSelect).toHaveBeenCalledWith(withoutBirthDate);
  });
});

function baseProps(): ClientSearchComboboxViewProps {
  return {
    id: "test-client-picker",
    label: "Клиент",
    placeholder: "Выберите клиента",
    selectedClient: null,
    clients: [],
    searchQuery: "",
    isOpen: false,
    isInitialLoading: false,
    isSearching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    activeClientId: null,
    errorMessage: null,
    onOpenChange: vi.fn(),
    onSearchChange: vi.fn(),
    onSelect: vi.fn(),
    onActiveClientChange: vi.fn(),
    onLoadMore: vi.fn()
  };
}

function clientOption(label: string, birthDate: string) {
  const [lastName, firstName] = label.split(" ");

  return {
    value: `${birthDate}-0000-4000-8000-000000000000`,
    label,
    initials: `${lastName?.[0] ?? ""}${firstName?.[0] ?? ""}`,
    subtitle: birthDate,
    birthDateDisplay: birthDate.split("-").reverse().join("."),
    hasBirthDate: true,
    birthData: {
      id: "55555555-5555-4555-8555-555555555555",
      clientUserId: `${birthDate}-0000-4000-8000-000000000000`,
      label: "Основные данные",
      birthDate,
      birthTime: null,
      birthTimePrecision: "unknown" as const,
      birthPlaceText: null,
      birthCountryCode: null,
      birthCity: null,
      birthRegion: null,
      birthTimezone: null,
      birthLatitude: null,
      birthLongitude: null,
      source: "client_profile" as const,
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z"
    }
  };
}

function findRequiredElement(
  root: ReactElement,
  predicate: (element: ReactElement) => boolean
): ReactElement {
  const result = findElements(root).find(predicate);
  if (!result) throw new Error("Element not found");

  return result;
}

function findElements(root: ReactElement): ReactElement[] {
  if (typeof root.type === "function") {
    const rendered = (root.type as (props: unknown) => ReactNode)(root.props);
    return isValidElement(rendered) ? findElements(rendered) : [];
  }

  const result: ReactElement[] = [root];
  for (const child of Children.toArray((root.props as { children?: ReactNode }).children)) {
    if (isValidElement(child)) {
      result.push(...findElements(child));
    }
  }

  return result;
}

function includesText(value: unknown, text: string): boolean {
  if (typeof value === "string") return value.includes(text);
  if (Array.isArray(value)) return value.some((item) => includesText(item, text));
  if (isValidElement(value)) {
    return includesText((value.props as { children?: unknown }).children, text);
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some((item) => includesText(item, text));
  }

  return false;
}

function getCssRule(css: string, selector: string): string {
  const match = new RegExp(`(?:^|\\n)${escapeRegExp(selector)}\\s*\\{(?<body>[^}]*)\\}`).exec(css);
  if (!match?.groups?.body) throw new Error(`CSS rule not found: ${selector}`);

  return match.groups.body;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
