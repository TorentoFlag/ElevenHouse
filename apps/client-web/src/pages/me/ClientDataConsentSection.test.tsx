// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { canonicalChartAiConsentNotices } from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientCopyByLocale } from "../../common/i18n/clientCopy";
import { ClientDataConsentSection } from "./ClientDataConsentSection";

const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const consentId = "44444444-4444-4444-8444-444444444444";

afterEach(cleanup);

describe("ClientDataConsentSection", () => {
  it("shows the complete canonical notice and requires an explicit unchecked acceptance", () => {
    const onGrant = vi.fn();

    render(
      <ClientDataConsentSection
        cards={[card({ state: "missing", consentId: null, canGrant: true })]}
        copy={clientCopyByLocale.ru.chartAiConsent}
        notice={canonicalChartAiConsentNotices.ru}
        noticeSha256="sha256:ru"
        pendingAction={null}
        status="ready"
        onGrant={onGrant}
        onRetry={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: canonicalChartAiConsentNotices.ru.title })).toBeTruthy();
    expect(screen.getByText(canonicalChartAiConsentNotices.ru.summary)).toBeTruthy();
    expect(screen.getByText(canonicalChartAiConsentNotices.ru.relationshipScope)).toBeTruthy();
    expect(screen.getByText(canonicalChartAiConsentNotices.ru.dataSent[0].label)).toBeTruthy();
    expect(screen.getByText(canonicalChartAiConsentNotices.ru.dataExcluded[0].label)).toBeTruthy();
    expect(screen.getByText(canonicalChartAiConsentNotices.ru.withdrawal)).toBeTruthy();

    const acceptance = screen.getByRole("checkbox", {
      name: clientCopyByLocale.ru.chartAiConsent.acceptanceLabel
    });
    const grant = screen.getByRole("button", {
      name: clientCopyByLocale.ru.chartAiConsent.grant
    });

    expect((acceptance as HTMLInputElement).checked).toBe(false);
    expect((grant as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(acceptance);
    expect((grant as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(grant);
    expect(onGrant).toHaveBeenCalledWith(astrologerUserId);
  });

  it("renders independent granted, revoked and stale relationship states", () => {
    const onRevoke = vi.fn();

    render(
      <ClientDataConsentSection
        cards={[
          card({ state: "granted", consentId, canGrant: false, canRevoke: true }),
          card({
            astrologerUserId: "33333333-3333-4333-8333-333333333333",
            publicName: "John Reed",
            state: "revoked",
            consentId,
            canGrant: true,
            canRevoke: false
          }),
          card({
            astrologerUserId: "55555555-5555-4555-8555-555555555555",
            publicName: "Mina Lee",
            state: "stale",
            consentId,
            canGrant: true,
            canRevoke: true
          })
        ]}
        copy={clientCopyByLocale.en.chartAiConsent}
        notice={canonicalChartAiConsentNotices.en}
        noticeSha256="sha256:en"
        pendingAction={null}
        status="ready"
        onGrant={vi.fn()}
        onRetry={vi.fn()}
        onRevoke={onRevoke}
      />
    );

    expect(screen.getByText(clientCopyByLocale.en.chartAiConsent.states.granted)).toBeTruthy();
    expect(screen.getByText(clientCopyByLocale.en.chartAiConsent.states.revoked)).toBeTruthy();
    expect(screen.getByText(clientCopyByLocale.en.chartAiConsent.states.stale)).toBeTruthy();

    const revokeButtons = screen.getAllByRole("button", {
      name: clientCopyByLocale.en.chartAiConsent.revoke
    });
    expect(revokeButtons).toHaveLength(2);
    fireEvent.click(revokeButtons[1]!);
    expect(onRevoke).toHaveBeenCalledWith(consentId);
  });

  it("requires a fresh checkbox action after grant, revoke and locale transitions", () => {
    const onGrant = vi.fn();
    const props = {
      copy: clientCopyByLocale.ru.chartAiConsent,
      notice: canonicalChartAiConsentNotices.ru,
      noticeSha256: "sha256:ru",
      pendingAction: null,
      status: "ready" as const,
      onGrant,
      onRetry: vi.fn(),
      onRevoke: vi.fn()
    };
    const { rerender } = render(
      <ClientDataConsentSection
        {...props}
        cards={[card({ state: "missing", consentId: null, canGrant: true })]}
      />
    );

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: props.copy.grant }));
    expect(onGrant).toHaveBeenCalledTimes(1);

    rerender(
      <ClientDataConsentSection
        {...props}
        cards={[card({ state: "granted", consentId, canGrant: false, canRevoke: true })]}
      />
    );
    rerender(
      <ClientDataConsentSection
        {...props}
        cards={[card({ state: "revoked", consentId, canGrant: true, canRevoke: false })]}
      />
    );
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole("checkbox"));
    rerender(
      <ClientDataConsentSection
        {...props}
        copy={clientCopyByLocale.en.chartAiConsent}
        notice={canonicalChartAiConsentNotices.en}
        noticeSha256="sha256:en"
        cards={[card({ state: "revoked", consentId, canGrant: true, canRevoke: false })]}
      />
    );
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("covers loading, empty, error and pending states without fabricating consent", () => {
    const { rerender } = render(
      <ClientDataConsentSection
        cards={null}
        copy={clientCopyByLocale.ru.chartAiConsent}
        notice={null}
        noticeSha256={null}
        pendingAction={null}
        status="loading"
        onGrant={vi.fn()}
        onRetry={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    expect(screen.getByText(clientCopyByLocale.ru.chartAiConsent.loading)).toBeTruthy();

    rerender(
      <ClientDataConsentSection
        cards={[]}
        copy={clientCopyByLocale.ru.chartAiConsent}
        notice={canonicalChartAiConsentNotices.ru}
        noticeSha256="sha256:ru"
        pendingAction={null}
        status="ready"
        onGrant={vi.fn()}
        onRetry={vi.fn()}
        onRevoke={vi.fn()}
      />
    );
    expect(screen.getByText(clientCopyByLocale.ru.chartAiConsent.empty)).toBeTruthy();

    const onRetry = vi.fn();
    rerender(
      <ClientDataConsentSection
        cards={null}
        copy={clientCopyByLocale.ru.chartAiConsent}
        notice={null}
        noticeSha256={null}
        pendingAction={null}
        status="error"
        onGrant={vi.fn()}
        onRetry={onRetry}
        onRevoke={vi.fn()}
      />
    );
    expect(screen.getByRole("alert").textContent).toContain(
      clientCopyByLocale.ru.chartAiConsent.error
    );
    fireEvent.click(
      screen.getByRole("button", { name: clientCopyByLocale.ru.chartAiConsent.retry })
    );
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <ClientDataConsentSection
        cards={[card({ state: "missing", consentId: null, canGrant: true })]}
        copy={clientCopyByLocale.ru.chartAiConsent}
        notice={canonicalChartAiConsentNotices.ru}
        noticeSha256="sha256:ru"
        pendingAction={{ kind: "grant", id: astrologerUserId }}
        status="ready"
        onGrant={vi.fn()}
        onRetry={vi.fn()}
        onRevoke={vi.fn()}
      />
    );
    expect(
      (
        screen.getByRole("button", {
          name: clientCopyByLocale.ru.chartAiConsent.granting
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });
});

function card(
  overrides: Partial<{
    astrologerUserId: string;
    publicName: string;
    state: "missing" | "granted" | "revoked" | "stale";
    consentId: string | null;
    canGrant: boolean;
    canRevoke: boolean;
  }> = {}
) {
  return {
    astrologerUserId: overrides.astrologerUserId ?? astrologerUserId,
    publicName: overrides.publicName ?? "Alice Vega",
    publicHandle: "alice-vega",
    state: overrides.state ?? "missing",
    consentId: overrides.consentId ?? null,
    grantedAt:
      overrides.state === "missing" ? null : "2026-08-03T12:00:00.000Z",
    revokedAt:
      overrides.state === "revoked" ? "2026-08-03T13:00:00.000Z" : null,
    canGrant: overrides.canGrant ?? false,
    canRevoke: overrides.canRevoke ?? false
  } as const;
}
