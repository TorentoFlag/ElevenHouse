source visual truth path: /Users/anton/Finext/ElevenHouse/.design-qa/products-constructor/01-reference-constructor-final-icons.png
implementation screenshot path: /Users/anton/Finext/ElevenHouse/.design-qa/products-constructor/02-implementation-final-icons.png
viewport: 2048 x 1067
state: Products route -> Create product -> Custom format, RU locale, authenticated astrologer workspace
full-view comparison evidence: /Users/anton/Finext/ElevenHouse/.design-qa/products-constructor/03-final-icons-comparison.png

**Findings**
- No blocking visual findings remain for the product constructor form.
- Remaining non-form differences come from the surrounding real product shell versus the static design demo shell: production sidebar content is role/route-driven, while the design reference includes demo-only navigation, bottom viewport switcher, and toast overlays.

**Required Fidelity Surfaces**
- Layout: constructor modal is scoped to the Products route outlet, not the full browser viewport. Shell width, header placement, left editor column, preview column, media row, title/price row, subtitle field, and chip rhythm align to the reference.
- Typography and controls: input reset, label line-height, field heights, chip heights, preview price hierarchy, and CTA sizing are set through production CSS rather than browser defaults.
- Product state: custom product draft now opens with the design-reference title, subtitle, price, included items, enabled modifiers, and live video flow.
- Iconography: missing reference icons were added to `@elevenhouse/design-system` and wired through typed product option mappings instead of local SVG fallbacks.

**Patches Made Since Previous QA Pass**
- Added design-system icons for image, mic, file download, globe, calendar, clock, lightning, users, gift, map, and star.
- Updated product constructor option mappings and preview/cabinet icon mappings to use the new DS icons.
- Updated the custom product default draft to match the design-reference demo content.
- Tightened constructor CSS for native inputs, title/price grid, labels, and preview geometry.

final result: passed
