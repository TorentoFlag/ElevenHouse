// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import { chartEngineCopyByLocale } from "../model/chartEngineCopy";
import { ChartBirthDataEditor } from "./ChartBirthDataEditor";

afterEach(cleanup);

describe("ChartBirthDataEditor", () => {
  it("uses the focused date and time pickers and saves their observable values", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <ChartBirthDataEditor
        client={client}
        copy={chartEngineCopyByLocale.en}
        disabled={false}
        errorMessage={null}
        isSaving={false}
        locale="en"
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole("button", { name: /Birth date/u }));
    await user.selectOptions(screen.getByLabelText("Birth year"), "1990");
    await user.selectOptions(screen.getByLabelText("Birth month"), "07");
    await user.click(screen.getByRole("button", { name: "July 15, 1990" }));
    await user.selectOptions(screen.getByLabelText("Time precision"), "exact");
    await user.click(screen.getByRole("button", { name: /Birth time/u }));
    await user.click(screen.getByRole("button", { name: "10:00" }));
    await user.click(screen.getByRole("button", { name: "30 minutes" }));
    await user.click(screen.getByRole("button", { name: "Save birth data" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        birthDate: "1990-07-15",
        birthTime: "10:30",
        birthTimePrecision: "exact"
      })
    );
  });
});

const client = {
  value: "22222222-2222-4222-8222-222222222222",
  label: "Marina Krasnova",
  initials: "MK",
  subtitle: "No birth data",
  birthDateDisplay: "—",
  hasBirthDate: false,
  birthData: null
} satisfies ClientSelectOption;
