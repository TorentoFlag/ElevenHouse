// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act, useState } from "react";
import type { ClientBirthPlaceCandidate } from "@elevenhouse/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BirthPlaceAutocomplete } from "./BirthPlaceAutocomplete";

const copy = {
  label: "Место рождения",
  placeholder: "Начните вводить город",
  searching: "Ищем место…",
  empty: "Место не найдено. Уточните запрос.",
  error: "Не удалось найти место.",
  retry: "Повторить",
  resolved: "Место подтверждено"
};

describe("BirthPlaceAutocomplete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("debounces requests, aborts stale work and ignores a stale response", async () => {
    const requests: Array<{
      readonly query: string;
      readonly signal: AbortSignal;
      readonly resolve: (value: readonly ClientBirthPlaceCandidate[]) => void;
    }> = [];
    const search = vi.fn(
      (query: string, signal: AbortSignal) =>
        new Promise<readonly ClientBirthPlaceCandidate[]>((resolve) => {
          requests.push({ query, signal, resolve });
        })
    );

    render(<Harness search={search} />);
    const input = screen.getByRole("combobox", { name: copy.label });

    fireEvent.change(input, { target: { value: "Rom" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(requests).toHaveLength(1);

    fireEvent.change(input, { target: { value: "Rome" } });
    expect(requests[0]?.signal.aborted).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(requests).toHaveLength(2);

    await act(async () => {
      requests[0]?.resolve([moscowCandidate()]);
      await Promise.resolve();
    });
    expect(screen.queryByText("Москва, Россия")).toBeNull();

    await act(async () => {
      requests[1]?.resolve([romeCandidate()]);
      await Promise.resolve();
    });
    expect(screen.getByRole("option", { name: /Rome, Italy/ })).toBeTruthy();
  });

  it("supports Arrow navigation, Enter selection and Escape dismissal", async () => {
    const onSelect = vi.fn();
    render(
      <Harness
        onSelect={onSelect}
        search={vi.fn(async () => [romeCandidate(), moscowCandidate()])}
      />
    );
    const input = screen.getByRole("combobox", { name: copy.label });

    fireEvent.change(input, { target: { value: "Rome" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toContain("option-0");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(romeCandidate());

    fireEvent.change(input, { target: { value: "Moscow" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(input.getAttribute("aria-activedescendant")).toContain("option-0");

    fireEvent.blur(input, { relatedTarget: null });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("shows explicit empty/error states and retries provider failures", async () => {
    const search = vi
      .fn<(query: string, signal: AbortSignal) => Promise<readonly ClientBirthPlaceCandidate[]>>()
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce([]);
    render(<Harness search={search} />);

    fireEvent.change(screen.getByRole("combobox", { name: copy.label }), {
      target: { value: "Rome" }
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(screen.getByRole("alert").textContent).toContain(copy.error);

    fireEvent.click(screen.getByRole("button", { name: copy.retry }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(search).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status").textContent).toContain(copy.empty);
  });

  it("cancels an in-flight request when Escape dismisses the search", async () => {
    let resolveSearch!: (value: readonly ClientBirthPlaceCandidate[]) => void;
    const search = vi.fn(
      (query: string, signal: AbortSignal) =>
        new Promise<readonly ClientBirthPlaceCandidate[]>((resolve) => {
          void query;
          void signal;
          resolveSearch = resolve;
        })
    );
    render(<Harness search={search} />);
    const input = screen.getByRole("combobox", { name: copy.label });

    fireEvent.change(input, { target: { value: "Rome" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    const signal = search.mock.calls[0]?.[1];
    expect(signal?.aborted).toBe(false);

    fireEvent.keyDown(input, { key: "Escape" });
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByText(copy.searching)).toBeNull();

    await act(async () => {
      resolveSearch([romeCandidate()]);
      await Promise.resolve();
    });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not search under three characters and announces an authoritative saved selection", async () => {
    const search = vi.fn(async () => [romeCandidate()]);
    render(
      <BirthPlaceAutocomplete
        copy={copy}
        disabled={false}
        latitude={55.7558}
        longitude={37.6173}
        selectedPlaceText="Москва, Россия"
        timezone="Europe/Moscow"
        value="Москва, Россия"
        onQueryChange={vi.fn()}
        onSelect={vi.fn()}
        onSearch={search}
      />
    );

    expect(screen.getByText(/Место подтверждено.*Europe\/Moscow/).textContent).toContain("55.7558");
    fireEvent.change(screen.getByRole("combobox", { name: copy.label }), {
      target: { value: "Ри" }
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(search).not.toHaveBeenCalled();
  });

  it("associates an explicit selection validation error with the combobox", () => {
    render(
      <BirthPlaceAutocomplete
        copy={copy}
        disabled={false}
        latitude={null}
        longitude={null}
        selectedPlaceText={null}
        timezone={null}
        validationError="Выберите место из найденных вариантов."
        value="произвольный текст"
        onQueryChange={vi.fn()}
        onSelect={vi.fn()}
        onSearch={vi.fn(async () => [])}
      />
    );

    const input = screen.getByRole("combobox", { name: copy.label });
    const alert = screen.getByRole("alert");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
  });
});

function Harness({
  onSelect = vi.fn(),
  search
}: {
  readonly onSelect?: (candidate: ClientBirthPlaceCandidate) => void;
  readonly search: (
    query: string,
    signal: AbortSignal
  ) => Promise<readonly ClientBirthPlaceCandidate[]>;
}) {
  const [value, setValue] = useState("");

  return (
    <BirthPlaceAutocomplete
      copy={copy}
      disabled={false}
      latitude={null}
      longitude={null}
      selectedPlaceText={null}
      timezone={null}
      value={value}
      onQueryChange={setValue}
      onSelect={onSelect}
      onSearch={search}
    />
  );
}

function romeCandidate(): ClientBirthPlaceCandidate {
  return {
    id: "geoapify:41485",
    label: "Rome, Lazio, Italy",
    placeName: "Rome, Italy",
    countryCode: "IT",
    city: "Rome",
    region: "Lazio",
    timezone: "Europe/Rome",
    latitude: 41.8933,
    longitude: 12.4829,
    provider: "geoapify",
    providerPlaceId: "41485"
  };
}

function moscowCandidate(): ClientBirthPlaceCandidate {
  return {
    id: "geoapify:moscow",
    label: "Москва, Россия",
    placeName: "Москва, Россия",
    countryCode: "RU",
    city: "Москва",
    region: "Москва",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173,
    provider: "geoapify",
    providerPlaceId: "moscow"
  };
}
