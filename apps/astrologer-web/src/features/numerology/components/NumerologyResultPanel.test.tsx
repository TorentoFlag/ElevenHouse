import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { astrologerCopyByLocale } from "../../../common/i18n/astrologerCopy";
import type { NumerologyWorkspaceModel } from "../model/numerologyWorkspaceModel";
import { NumerologyResultPanel } from "./NumerologyResultPanel";

const model: NumerologyWorkspaceModel = {
  mode: "individual",
  title: "Нумерологический расчет",
  status: "preview",
  subject: null,
  partner: null,
  keyNumbers: [],
  matrix: null,
  strengthLines: [
    {
      code: "family",
      selector: "line:family",
      label: "Семейность",
      value: 3,
      cells: ["2", "5", "8"],
      level: "Выраженная линия",
      levelCode: "expressed",
      text: "Описывает сценарии близости, дома и поддержки."
    }
  ],
  personalYear: null,
  personalMonths: [],
  compatibility: null,
  defaultSelector: "line:family"
};

function renderPanel(): string {
  return renderToStaticMarkup(
    <NumerologyResultPanel
      model={model}
      detail={null}
      selectedSelector="line:family"
      isPeriodVisible={false}
      interpretationCopy={astrologerCopyByLocale.ru.numerology.interpretation}
      interpretationText=""
      isCreatingAiDraft={false}
      aiDraftErrorMessage={null}
      isAiDraftDisabled={false}
      aiDraftDisabledReason={null}
      isApproveInterpretationDisabled={true}
      isSaveInterpretationDisabled={true}
      onInterpretationChange={() => undefined}
      onSaveInterpretation={() => undefined}
      onApproveInterpretation={() => undefined}
      onCreateAiDraft={() => undefined}
      onSelect={() => undefined}
    />
  );
}

describe("NumerologyResultPanel strength lines", () => {
  it("fills an expressed line to its semantic meter position", () => {
    expect(renderPanel()).toContain('style="width:75%"');
  });

  it("announces the raw count and semantic level without an artificial percentage", () => {
    expect(renderPanel()).toContain('aria-label="Семейность, 3, Выраженная линия"');
  });
});
