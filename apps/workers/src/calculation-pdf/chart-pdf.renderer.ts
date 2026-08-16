import type {
  ChartAspect,
  ChartAstrocartographyLine,
  ChartHouse,
  ChartPoint,
  ChartRenderResult,
  ChartSolarReturnAspect,
  ChartSynastryAspect,
  ChartTransitAspect
} from "@elevenhouse/contracts";
import type { ChartPdfDocument, ChartPdfInterpretation } from "./calculation-pdf.documents";
import { formatDegreeMinutes, formatZodiacPosition } from "./chart-pdf.position";
import { createPdfLayout, type PdfGraphicContext, type PdfTableOptions } from "./pdf-layout";

type KeyValue = { readonly label: string; readonly value: string };
type OverlayWheelAspect = {
  readonly primaryPoint: string;
  readonly overlayPoint: string;
  readonly type: string;
};

export type ChartPdfBlock =
  | {
      readonly kind: "wheel";
      readonly heading: string;
      readonly result: ChartRenderResult;
    }
  | {
      readonly kind: "overlay_wheel";
      readonly heading: string;
      readonly primary: ChartRenderResult;
      readonly overlay: ChartRenderResult;
      readonly aspectsToPrimary: readonly OverlayWheelAspect[];
    }
  | {
      readonly kind: "synastry_wheel";
      readonly heading: string;
      readonly primary: ChartRenderResult;
      readonly partner: ChartRenderResult;
      readonly aspectsBetween: readonly ChartSynastryAspect[];
    }
  | {
      readonly kind: "astrocartography_map";
      readonly heading: string;
      readonly lines: readonly ChartAstrocartographyLine[];
    }
  | {
      readonly kind: "section";
      readonly heading: string;
      readonly text: string;
      readonly muted?: boolean;
    }
  | { readonly kind: "key_values"; readonly heading: string; readonly items: readonly KeyValue[] }
  | {
      readonly kind: "table";
      readonly heading: string;
      readonly headers: readonly string[];
      readonly rows: readonly (readonly string[])[];
      readonly layout?: PdfTableOptions;
    };

export type ChartPdfRenderer = {
  readonly render: (
    document: ChartPdfDocument
  ) => Promise<{ readonly bytes: Buffer; readonly pageCount: number }>;
};

export function createChartPdfRenderer(
  input: {
    readonly regularFontBytes?: Uint8Array;
    readonly semiboldFontBytes?: Uint8Array;
  } = {}
): ChartPdfRenderer {
  return {
    render: async (document) => {
      const labels = document.locale === "ru" ? ru : en;
      const title = chartPdfDocumentTitle(document, labels);
      const layout = await createPdfLayout({
        locale: document.locale,
        title,
        creator: "ElevenHouse Chart Engine",
        createdAt: document.createdAt,
        ...input
      });
      layout.drawCover(title, labels.subtitle);
      for (const block of buildChartPdfContent(document)) {
        if (block.kind === "wheel") {
          layout.drawGraphic(block.heading, 360, (context) =>
            drawChartWheel(context, block.result, labels)
          );
        } else if (block.kind === "overlay_wheel") {
          layout.drawGraphic(block.heading, 360, (context) =>
            drawOverlayWheel(context, block.primary, block.overlay, block.aspectsToPrimary, labels)
          );
        } else if (block.kind === "synastry_wheel") {
          layout.drawGraphic(block.heading, 360, (context) =>
            drawSynastryWheel(context, block.primary, block.partner, block.aspectsBetween, labels)
          );
        } else if (block.kind === "astrocartography_map") {
          layout.drawGraphic(block.heading, 320, (context) =>
            drawAstrocartographyMap(context, block.lines, labels)
          );
        } else if (block.kind === "section") {
          layout.drawSection(block.heading, block.text, block.muted);
        } else if (block.kind === "key_values") {
          layout.drawKeyValues(block.heading, block.items);
        } else {
          layout.drawTable(block.heading, block.headers, block.rows, block.layout);
        }
      }
      return layout.save();
    }
  };
}

function chartPdfDocumentTitle(document: ChartPdfDocument, labels: Labels): string {
  if (document.result.method === "natal") {
    return labels.title;
  }
  return document.calculationTitle || labels.chartTypes[document.result.method] || labels.title;
}

export function buildChartPdfContent(document: ChartPdfDocument): readonly ChartPdfBlock[] {
  const labels = document.locale === "ru" ? ru : en;
  const result = document.result;
  const blocks: ChartPdfBlock[] = [
    ...buildMethodBlocks(document, labels),
    {
      kind: "key_values",
      heading: labels.calculation,
      items: [
        { label: labels.calculationTitle, value: document.calculationTitle },
        ...(result.method === "natal"
          ? []
          : [
              { label: labels.chartType, value: labels.chartTypes[result.method] ?? result.method }
            ]),
        {
          label: labels.houseSystem,
          value: labels.houseSystems[result.settings.houseSystem] ?? result.settings.houseSystem
        },
        {
          label: labels.nodes,
          value: labels.nodeTypes[result.settings.nodeType] ?? result.settings.nodeType
        },
        {
          label: labels.orbs,
          value: `${result.settings.aspectPreset} × ${result.settings.orbMultiplier}`
        }
      ]
    },
    ...buildInputBlocks(document, labels)
  ];
  const interpretationRows = buildInterpretationRows(document.interpretations, labels);
  const approvedInterpretation = document.approvedInterpretation?.trim();
  if (approvedInterpretation) {
    blocks.push({
      kind: "section",
      heading: labels.aiInterpretation,
      text: approvedInterpretation
    });
  }
  if (interpretationRows.length > 0) {
    blocks.push({
      kind: "table",
      heading: labels.dictionaryInterpretations,
      headers: [
        labels.interpretationPosition,
        labels.interpretationContext,
        labels.interpretationText,
        labels.interpretationSource
      ],
      rows: interpretationRows,
      layout: { columnWeights: [1.1, 1.1, 2.5, 0.8], fontSize: 8.3, lineHeight: 12 }
    });
  }
  return blocks;
}

function buildInputBlocks(document: ChartPdfDocument, labels: Labels): readonly ChartPdfBlock[] {
  const result = document.result;
  if (result.method === "horary") {
    return [
      {
        kind: "key_values",
        heading: labels.questionData,
        items: [
          { label: labels.question, value: result.questionSnapshot.question },
          { label: labels.category, value: result.questionSnapshot.category },
          { label: labels.birthDate, value: result.questionSnapshot.date },
          { label: labels.birthTime, value: result.questionSnapshot.time },
          { label: labels.timezone, value: result.questionSnapshot.timezone },
          {
            label: labels.place,
            value: `${result.questionSnapshot.latitude}, ${result.questionSnapshot.longitude}`
          }
        ]
      }
    ];
  }
  return [
    {
      kind: "key_values",
      heading: labels.birthData,
      items: birthDataItems(result.inputSnapshot, labels)
    }
  ];
}

function buildMethodBlocks(document: ChartPdfDocument, labels: Labels): readonly ChartPdfBlock[] {
  const result = document.result;
  if (result.method === "natal" || result.method === "composite" || result.method === "horary") {
    return [
      ...chartRenderBlocks({ result: result.result, labels }),
      ...warningBlocks(result.result.warnings, labels)
    ];
  }
  if (result.method === "astrocartography") {
    return [
      {
        kind: "astrocartography_map",
        heading: labels.astrocartographyMap,
        lines: result.result.lines
      },
      {
        kind: "table",
        heading: labels.astrocartographyLines,
        headers: [labels.point, labels.angle, labels.name, labels.pathPoints],
        rows: result.result.lines.map((line) => astrocartographyLineRow(line, labels)),
        layout: { columnWeights: [1, 0.7, 1.4, 0.8], fontSize: 8.5, lineHeight: 12 }
      },
      ...warningBlocks(result.result.warnings, labels)
    ];
  }
  if (result.method === "synastry") {
    return [
      {
        kind: "synastry_wheel",
        heading: labels.synastryWheel,
        primary: result.result.primary,
        partner: result.result.partner,
        aspectsBetween: result.result.aspectsBetween
      },
      ...chartRenderDataBlocks({
        result: result.result.primary,
        labels,
        prefix: labels.primaryChart
      }),
      ...chartRenderDataBlocks({
        result: result.result.partner,
        labels,
        prefix: labels.partnerChart
      }),
      {
        kind: "table",
        heading: labels.aspectsBetween,
        headers: [labels.pointA, labels.aspect, labels.pointB, labels.orb, labels.strength],
        rows: result.result.aspectsBetween.map((aspect) => synastryAspectRow(aspect, labels)),
        layout: { columnWeights: [1, 1, 1, 0.7, 0.7], fontSize: 8.5, lineHeight: 12 }
      },
      {
        kind: "table",
        heading: labels.houseOverlays,
        headers: [labels.owner, labels.point, labels.projectedHouseOwner, labels.house],
        rows: result.result.houseOverlays.map((overlay) => [
          labels.relationshipOwners[overlay.owner] ?? overlay.owner,
          labels.pointsById[overlay.point] ?? overlay.point,
          labels.relationshipOwners[overlay.projectedHouseOwner] ?? overlay.projectedHouseOwner,
          labels.houseValue(overlay.projectedHouse)
        ]),
        layout: { columnWeights: [0.8, 1, 1, 0.8], fontSize: 8.5, lineHeight: 12 }
      },
      ...warningBlocks(result.result.warnings, labels)
    ];
  }
  if (result.method === "transit") {
    return [
      {
        kind: "key_values",
        heading: labels.eventMoment,
        items: momentItems(result.transitSnapshot, labels)
      },
      {
        kind: "overlay_wheel",
        heading: labels.transitWheel,
        primary: result.result.natal,
        overlay: result.result.transit,
        aspectsToPrimary: result.result.aspectsToNatal.map((aspect) => ({
          primaryPoint: aspect.natalPoint,
          overlayPoint: aspect.transitPoint,
          type: aspect.type
        }))
      },
      ...chartRenderDataBlocks({ result: result.result.natal, labels, prefix: labels.natalChart }),
      ...chartRenderDataBlocks({
        result: result.result.transit,
        labels,
        prefix: labels.transitChart
      }),
      {
        kind: "table",
        heading: labels.aspectsToNatal,
        headers: [labels.pointA, labels.aspect, labels.pointB, labels.orb, labels.strength],
        rows: result.result.aspectsToNatal.map((aspect) => transitAspectRow(aspect, labels)),
        layout: { columnWeights: [1, 1, 1, 0.7, 0.7], fontSize: 8.5, lineHeight: 12 }
      },
      ...warningBlocks(result.result.warnings, labels)
    ];
  }
  if (result.method === "solar_return") {
    return [
      {
        kind: "key_values",
        heading: labels.returnData,
        items: [
          { label: labels.year, value: String(result.solarReturnSnapshot.year) },
          { label: labels.timezone, value: result.solarReturnSnapshot.location.timezone },
          {
            label: labels.place,
            value: `${result.solarReturnSnapshot.location.latitude}, ${result.solarReturnSnapshot.location.longitude}`
          },
          { label: labels.resolvedAt, value: result.solarReturnSnapshot.resolvedAt }
        ]
      },
      {
        kind: "overlay_wheel",
        heading: labels.solarReturnWheel,
        primary: result.result.natal,
        overlay: result.result.solarReturn,
        aspectsToPrimary: result.result.aspectsToNatal.map((aspect) => ({
          primaryPoint: aspect.natalPoint,
          overlayPoint: aspect.solarReturnPoint,
          type: aspect.type
        }))
      },
      ...chartRenderDataBlocks({ result: result.result.natal, labels, prefix: labels.natalChart }),
      ...chartRenderDataBlocks({
        result: result.result.solarReturn,
        labels,
        prefix: labels.solarReturnChart
      }),
      {
        kind: "table",
        heading: labels.aspectsToNatal,
        headers: [labels.pointA, labels.aspect, labels.pointB, labels.orb, labels.strength],
        rows: result.result.aspectsToNatal.map((aspect) => solarReturnAspectRow(aspect, labels)),
        layout: { columnWeights: [1, 1, 1, 0.7, 0.7], fontSize: 8.5, lineHeight: 12 }
      },
      ...warningBlocks(result.result.warnings, labels)
    ];
  }
  return [
    {
      kind: "key_values",
      heading: labels.progressionData,
      items: [
        { label: labels.targetDate, value: result.progressionSnapshot.targetDate },
        { label: labels.progressionType, value: result.progressionSnapshot.progressionType },
        {
          label: labels.symbolicDate,
          value: result.progressionSnapshot.calculationBasis.symbolicDate
        }
      ]
    },
    {
      kind: "overlay_wheel",
      heading: labels.progressionWheel,
      primary: result.result.natal,
      overlay: result.result.progressed,
      aspectsToPrimary: result.result.aspectsToNatal.map((aspect) => ({
        primaryPoint: aspect.natalPoint,
        overlayPoint: aspect.progressedPoint,
        type: aspect.type
      }))
    },
    ...chartRenderDataBlocks({ result: result.result.natal, labels, prefix: labels.natalChart }),
    ...chartRenderDataBlocks({
      result: result.result.progressed,
      labels,
      prefix: labels.progressedChart
    }),
    {
      kind: "table",
      heading: labels.aspectsToNatal,
      headers: [labels.pointA, labels.aspect, labels.pointB, labels.orb, labels.strength],
      rows: result.result.aspectsToNatal.map((aspect) => progressionAspectRow(aspect, labels)),
      layout: { columnWeights: [1, 1, 1, 0.7, 0.7], fontSize: 8.5, lineHeight: 12 }
    },
    ...warningBlocks(result.result.warnings, labels)
  ];
}

function chartRenderBlocks(input: {
  readonly result: ChartRenderResult;
  readonly labels: Labels;
  readonly prefix?: string;
}): readonly ChartPdfBlock[] {
  const heading = (value: string) => (input.prefix ? `${input.prefix} · ${value}` : value);
  return [
    {
      kind: "wheel",
      heading: heading(input.labels.chartWheel),
      result: input.result
    },
    ...chartRenderDataBlocks(input)
  ];
}

function chartRenderDataBlocks(input: {
  readonly result: ChartRenderResult;
  readonly labels: Labels;
  readonly prefix?: string;
}): readonly ChartPdfBlock[] {
  const heading = (value: string) => (input.prefix ? `${input.prefix} · ${value}` : value);
  return [
    {
      kind: "table",
      heading: heading(input.labels.points),
      headers: [
        input.labels.point,
        input.labels.sign,
        input.labels.position,
        input.labels.house,
        input.labels.motion
      ],
      rows: input.result.points.map((point) => pointRow(point, input.labels)),
      layout: { columnWeights: [1.3, 1, 1, 0.8, 0.8] }
    },
    {
      kind: "table",
      heading: heading(input.labels.houses),
      headers: [input.labels.house, input.labels.sign, input.labels.position],
      rows: input.result.houses.map((house) => houseRow(house, input.labels)),
      layout: { columnWeights: [0.8, 1, 1] }
    },
    {
      kind: "table",
      heading: heading(input.labels.aspects),
      headers: [
        input.labels.pointA,
        input.labels.aspect,
        input.labels.pointB,
        input.labels.orb,
        input.labels.strength
      ],
      rows: input.result.aspects.map((aspect) => aspectRow(aspect, input.labels)),
      layout: { columnWeights: [1, 1, 1, 0.7, 0.7], fontSize: 8.5, lineHeight: 12 }
    },
    {
      kind: "table",
      heading: heading(input.labels.distributions),
      headers: [input.labels.factor, input.labels.value],
      rows: distributionRows(input.result, input.labels),
      layout: { columnWeights: [1.5, 0.5] }
    }
  ];
}

function birthDataItems(
  inputSnapshot: ChartPdfDocument["result"] extends infer Result
    ? Result extends { readonly inputSnapshot: infer Snapshot }
      ? Snapshot
      : never
    : never,
  labels: Labels
): readonly KeyValue[] {
  return [
    { label: labels.birthDate, value: inputSnapshot.birthDate },
    { label: labels.birthTime, value: inputSnapshot.birthTime },
    { label: labels.timezone, value: inputSnapshot.timezone },
    {
      label: labels.place,
      value: `${inputSnapshot.latitude}, ${inputSnapshot.longitude}`
    },
    {
      label: labels.timePrecision,
      value:
        labels.timePrecisions[inputSnapshot.birthTimePrecision] ?? inputSnapshot.birthTimePrecision
    }
  ];
}

function momentItems(
  moment: {
    readonly date: string;
    readonly time: string;
    readonly timezone: string;
    readonly latitude: number;
    readonly longitude: number;
  },
  labels: Labels
): readonly KeyValue[] {
  return [
    { label: labels.birthDate, value: moment.date },
    { label: labels.birthTime, value: moment.time },
    { label: labels.timezone, value: moment.timezone },
    { label: labels.place, value: `${moment.latitude}, ${moment.longitude}` }
  ];
}

function warningBlocks(
  warnings: readonly { readonly code: string; readonly message: string }[],
  labels: Labels
): readonly ChartPdfBlock[] {
  return warnings.length > 0
    ? [
        {
          kind: "table",
          heading: labels.warnings,
          headers: [labels.code, labels.message],
          rows: warnings.map((warning) => [warning.code, warning.message]),
          layout: { columnWeights: [1, 2] }
        }
      ]
    : [];
}

function drawChartWheel(
  context: PdfGraphicContext,
  result: ChartRenderResult,
  labels: Labels
): void {
  const points = result.points;
  const houses = result.houses;
  const ascLongitude = houses.find((house) => house.number === 1)?.longitude ?? 0;
  const center = { x: context.x + context.width / 2, y: context.y + 186 };
  const radiusScale = 0.68;
  const outerRadius = 220 * radiusScale;
  const middleRadius = 166 * radiusScale;
  const aspectRadius = 132 * radiusScale;
  const innerRadius = 72 * radiusScale;
  const markerLongitudes = spreadPointLongitudes(
    points.filter((point) => !axisPointIds.has(point.id))
  );

  context.page.drawRectangle({
    x: context.x,
    y: context.y,
    width: context.width,
    height: context.height,
    color: context.colors.surface,
    borderColor: context.colors.border,
    borderWidth: 0.6
  });
  for (const radius of [outerRadius, middleRadius, aspectRadius, innerRadius]) {
    context.page.drawCircle({
      x: center.x,
      y: center.y,
      size: radius,
      borderColor: context.rgb(0.45, 0.41, 0.56),
      borderWidth: radius === outerRadius ? 0.9 : 0.55
    });
  }
  for (let degreeValue = 0; degreeValue < 360; degreeValue += 1) {
    const isSign = degreeValue % 30 === 0;
    const isTen = degreeValue % 10 === 0;
    const isFive = degreeValue % 5 === 0;
    const tickLength = isSign ? 10 : isTen ? 6.5 : isFive ? 4.2 : 2.3;
    const tick = radialLine(
      center,
      degreeValue,
      middleRadius - tickLength,
      middleRadius,
      ascLongitude
    );
    context.page.drawLine({
      start: { x: tick.x1, y: tick.y1 },
      end: { x: tick.x2, y: tick.y2 },
      thickness: isSign ? 0.65 : isTen ? 0.45 : 0.25,
      color: context.rgb(0.49, 0.46, 0.59)
    });
  }
  zodiacLabels.forEach((zodiac, index) => {
    const longitude = index * 30;
    const line = radialLine(center, longitude, middleRadius, outerRadius, ascLongitude);
    const label = polar(center, longitude + 15, 193 * radiusScale, ascLongitude);
    context.page.drawLine({
      start: { x: line.x1, y: line.y1 },
      end: { x: line.x2, y: line.y2 },
      thickness: 0.55,
      color: context.rgb(0.36, 0.33, 0.46)
    });
    context.page.drawText(zodiac.label, {
      x: label.x - 7,
      y: label.y - 4,
      font: context.semibold,
      size: 8.5,
      color: zodiac.color(context.rgb)
    });
  });
  for (const house of houses) {
    const line = radialLine(center, house.longitude, innerRadius, middleRadius, ascLongitude);
    const nextHouse = houses.find((candidate) => candidate.number === (house.number % 12) + 1);
    const labelLongitude =
      house.longitude + arcDistance(house.longitude, nextHouse?.longitude ?? house.longitude) / 2;
    const label = polar(center, labelLongitude, 98 * radiusScale, ascLongitude);
    const isAxis = house.number === 1 || house.number === 10;
    context.page.drawLine({
      start: { x: line.x1, y: line.y1 },
      end: { x: line.x2, y: line.y2 },
      thickness: isAxis ? 0.9 : 0.35,
      color: isAxis ? context.rgb(0.84, 0.68, 0.25) : context.rgb(0.38, 0.34, 0.51)
    });
    context.page.drawText(String(house.number), {
      x: label.x - 4,
      y: label.y - 4,
      font: context.semibold,
      size: 8,
      color: context.rgb(0.52, 0.48, 0.62)
    });
    if (isAxis) {
      const axisPosition = polar(center, house.longitude, 184 * radiusScale, ascLongitude);
      context.page.drawText(house.number === 1 ? "Asc" : "MC", {
        x: axisPosition.x - 9,
        y: axisPosition.y - 4,
        font: context.semibold,
        size: 10,
        color: context.rgb(0.84, 0.68, 0.25)
      });
    }
  }
  for (const aspect of result.aspects) {
    const pointA = points.find((point) => point.id === aspect.pointA);
    const pointB = points.find((point) => point.id === aspect.pointB);
    if (!pointA || !pointB) continue;
    const start = polar(center, pointA.longitude, aspectRadius, ascLongitude);
    const end = polar(center, pointB.longitude, aspectRadius, ascLongitude);
    context.page.drawLine({
      start,
      end,
      thickness: 0.55,
      color: aspectColor(aspect, context)
    });
  }
  for (const point of points) {
    if (axisPointIds.has(point.id)) continue;
    const exact = polar(center, point.longitude, middleRadius, ascLongitude);
    const marker = polar(
      center,
      markerLongitudes[point.id] ?? point.longitude,
      142 * radiusScale,
      ascLongitude
    );
    context.page.drawLine({
      start: exact,
      end: marker,
      thickness: 0.35,
      color: context.rgb(0.5, 0.48, 0.61)
    });
    context.page.drawCircle({
      x: marker.x,
      y: marker.y,
      size: 10,
      color: context.rgb(0.18, 0.15, 0.28),
      borderColor: context.rgb(0.56, 0.5, 0.72),
      borderWidth: 0.7
    });
    context.page.drawText(pointGlyph(point.id), {
      x: marker.x - 5.5,
      y: marker.y - 4,
      font: context.semibold,
      size: 7.3,
      color: context.rgb(0.92, 0.9, 0.98)
    });
    if (point.retrograde) {
      context.page.drawText("R", {
        x: marker.x + 9,
        y: marker.y + 7,
        font: context.semibold,
        size: 6,
        color: context.rgb(0.84, 0.68, 0.25)
      });
    }
  }
  context.page.drawText(labels.chartWheelCaption, {
    x: context.x + 18,
    y: context.y + 16,
    font: context.regular,
    size: 8,
    color: context.colors.muted
  });
}

function drawSynastryWheel(
  context: PdfGraphicContext,
  primary: ChartRenderResult,
  partner: ChartRenderResult,
  aspectsBetween: readonly ChartSynastryAspect[],
  labels: Labels
): void {
  const primaryPoints = primary.points;
  const partnerPoints = partner.points;
  const houses = primary.houses;
  const ascLongitude = houses.find((house) => house.number === 1)?.longitude ?? 0;
  const center = { x: context.x + context.width / 2, y: context.y + 186 };
  const radiusScale = 0.68;
  const outerRadius = 220 * radiusScale;
  const middleRadius = 166 * radiusScale;
  const aspectRadius = 132 * radiusScale;
  const innerRadius = 72 * radiusScale;
  const primaryMarkerLongitudes = spreadPointLongitudes(
    primaryPoints.filter((point) => !axisPointIds.has(point.id))
  );
  const partnerMarkerLongitudes = spreadPointLongitudes(
    partnerPoints.filter((point) => !axisPointIds.has(point.id)),
    9
  );

  context.page.drawRectangle({
    x: context.x,
    y: context.y,
    width: context.width,
    height: context.height,
    color: context.colors.surface,
    borderColor: context.colors.border,
    borderWidth: 0.6
  });
  for (const radius of [outerRadius, middleRadius, aspectRadius, innerRadius]) {
    context.page.drawCircle({
      x: center.x,
      y: center.y,
      size: radius,
      borderColor: context.rgb(0.45, 0.41, 0.56),
      borderWidth: radius === outerRadius ? 0.9 : 0.55
    });
  }
  for (let degreeValue = 0; degreeValue < 360; degreeValue += 1) {
    const isSign = degreeValue % 30 === 0;
    const isTen = degreeValue % 10 === 0;
    const isFive = degreeValue % 5 === 0;
    const tickLength = isSign ? 10 : isTen ? 6.5 : isFive ? 4.2 : 2.3;
    const tick = radialLine(
      center,
      degreeValue,
      middleRadius - tickLength,
      middleRadius,
      ascLongitude
    );
    context.page.drawLine({
      start: { x: tick.x1, y: tick.y1 },
      end: { x: tick.x2, y: tick.y2 },
      thickness: isSign ? 0.65 : isTen ? 0.45 : 0.25,
      color: context.rgb(0.49, 0.46, 0.59)
    });
  }
  zodiacLabels.forEach((zodiac, index) => {
    const longitude = index * 30;
    const line = radialLine(center, longitude, middleRadius, outerRadius, ascLongitude);
    const label = polar(center, longitude + 15, 193 * radiusScale, ascLongitude);
    context.page.drawLine({
      start: { x: line.x1, y: line.y1 },
      end: { x: line.x2, y: line.y2 },
      thickness: 0.55,
      color: context.rgb(0.36, 0.33, 0.46)
    });
    context.page.drawText(zodiac.label, {
      x: label.x - 7,
      y: label.y - 4,
      font: context.semibold,
      size: 8.5,
      color: zodiac.color(context.rgb)
    });
  });
  for (const house of houses) {
    const line = radialLine(center, house.longitude, innerRadius, middleRadius, ascLongitude);
    const nextHouse = houses.find((candidate) => candidate.number === (house.number % 12) + 1);
    const labelLongitude =
      house.longitude + arcDistance(house.longitude, nextHouse?.longitude ?? house.longitude) / 2;
    const label = polar(center, labelLongitude, 98 * radiusScale, ascLongitude);
    const isAxis = house.number === 1 || house.number === 10;
    context.page.drawLine({
      start: { x: line.x1, y: line.y1 },
      end: { x: line.x2, y: line.y2 },
      thickness: isAxis ? 0.9 : 0.35,
      color: isAxis ? context.rgb(0.84, 0.68, 0.25) : context.rgb(0.38, 0.34, 0.51)
    });
    context.page.drawText(String(house.number), {
      x: label.x - 4,
      y: label.y - 4,
      font: context.semibold,
      size: 8,
      color: context.rgb(0.52, 0.48, 0.62)
    });
    if (isAxis) {
      const axisPosition = polar(center, house.longitude, 184 * radiusScale, ascLongitude);
      context.page.drawText(house.number === 1 ? "Asc" : "MC", {
        x: axisPosition.x - 9,
        y: axisPosition.y - 4,
        font: context.semibold,
        size: 10,
        color: context.rgb(0.84, 0.68, 0.25)
      });
    }
  }
  for (const aspect of primary.aspects) {
    const pointA = primaryPoints.find((point) => point.id === aspect.pointA);
    const pointB = primaryPoints.find((point) => point.id === aspect.pointB);
    if (!pointA || !pointB) continue;
    const start = polar(center, pointA.longitude, aspectRadius, ascLongitude);
    const end = polar(center, pointB.longitude, aspectRadius, ascLongitude);
    context.page.drawLine({
      start,
      end,
      thickness: 0.45,
      color: aspectColor(aspect, context)
    });
  }
  for (const aspect of aspectsBetween) {
    const primaryPoint = primaryPoints.find((point) => point.id === aspect.primaryPoint);
    const partnerPoint = partnerPoints.find((point) => point.id === aspect.partnerPoint);
    if (!primaryPoint || !partnerPoint) continue;
    const start = polar(center, primaryPoint.longitude, aspectRadius, ascLongitude);
    const end = polar(
      center,
      partnerMarkerLongitudes[partnerPoint.id] ?? partnerPoint.longitude,
      178 * radiusScale,
      ascLongitude
    );
    context.page.drawLine({
      start,
      end,
      thickness: 0.65,
      color: aspectColor(aspect, context)
    });
  }
  drawWheelMarkers({
    context,
    center,
    ascLongitude,
    points: primaryPoints,
    markerLongitudes: primaryMarkerLongitudes,
    exactRadius: middleRadius,
    markerRadius: 142 * radiusScale,
    guideColor: context.rgb(0.5, 0.48, 0.61),
    dotBorderColor: context.rgb(0.56, 0.5, 0.72),
    labelColor: context.rgb(0.92, 0.9, 0.98)
  });
  drawWheelMarkers({
    context,
    center,
    ascLongitude,
    points: partnerPoints,
    markerLongitudes: partnerMarkerLongitudes,
    exactRadius: middleRadius,
    markerRadius: 178 * radiusScale,
    guideColor: context.rgb(0.84, 0.68, 0.25),
    dotBorderColor: context.rgb(0.84, 0.68, 0.25),
    labelColor: context.rgb(0.98, 0.93, 0.64)
  });
  context.page.drawText(labels.synastryWheelCaption, {
    x: context.x + 18,
    y: context.y + 16,
    font: context.regular,
    size: 8,
    color: context.colors.muted
  });
}

function drawOverlayWheel(
  context: PdfGraphicContext,
  primary: ChartRenderResult,
  overlay: ChartRenderResult,
  aspectsToPrimary: readonly OverlayWheelAspect[],
  labels: Labels
): void {
  const primaryPoints = primary.points;
  const overlayPoints = overlay.points;
  const houses = primary.houses;
  const ascLongitude = houses.find((house) => house.number === 1)?.longitude ?? 0;
  const center = { x: context.x + context.width / 2, y: context.y + 186 };
  const radiusScale = 0.68;
  const outerRadius = 220 * radiusScale;
  const middleRadius = 166 * radiusScale;
  const aspectRadius = 132 * radiusScale;
  const innerRadius = 72 * radiusScale;
  const primaryMarkerLongitudes = spreadPointLongitudes(
    primaryPoints.filter((point) => !axisPointIds.has(point.id))
  );
  const overlayMarkerLongitudes = spreadPointLongitudes(
    overlayPoints.filter((point) => !axisPointIds.has(point.id)),
    9
  );

  context.page.drawRectangle({
    x: context.x,
    y: context.y,
    width: context.width,
    height: context.height,
    color: context.colors.surface,
    borderColor: context.colors.border,
    borderWidth: 0.6
  });
  for (const radius of [outerRadius, middleRadius, aspectRadius, innerRadius]) {
    context.page.drawCircle({
      x: center.x,
      y: center.y,
      size: radius,
      borderColor: context.rgb(0.45, 0.41, 0.56),
      borderWidth: radius === outerRadius ? 0.9 : 0.55
    });
  }
  for (let degreeValue = 0; degreeValue < 360; degreeValue += 1) {
    const isSign = degreeValue % 30 === 0;
    const isTen = degreeValue % 10 === 0;
    const isFive = degreeValue % 5 === 0;
    const tickLength = isSign ? 10 : isTen ? 6.5 : isFive ? 4.2 : 2.3;
    const tick = radialLine(
      center,
      degreeValue,
      middleRadius - tickLength,
      middleRadius,
      ascLongitude
    );
    context.page.drawLine({
      start: { x: tick.x1, y: tick.y1 },
      end: { x: tick.x2, y: tick.y2 },
      thickness: isSign ? 0.65 : isTen ? 0.45 : 0.25,
      color: context.rgb(0.49, 0.46, 0.59)
    });
  }
  zodiacLabels.forEach((zodiac, index) => {
    const longitude = index * 30;
    const line = radialLine(center, longitude, middleRadius, outerRadius, ascLongitude);
    const label = polar(center, longitude + 15, 193 * radiusScale, ascLongitude);
    context.page.drawLine({
      start: { x: line.x1, y: line.y1 },
      end: { x: line.x2, y: line.y2 },
      thickness: 0.55,
      color: context.rgb(0.36, 0.33, 0.46)
    });
    context.page.drawText(zodiac.label, {
      x: label.x - 7,
      y: label.y - 4,
      font: context.semibold,
      size: 8.5,
      color: zodiac.color(context.rgb)
    });
  });
  for (const house of houses) {
    const line = radialLine(center, house.longitude, innerRadius, middleRadius, ascLongitude);
    const nextHouse = houses.find((candidate) => candidate.number === (house.number % 12) + 1);
    const labelLongitude =
      house.longitude + arcDistance(house.longitude, nextHouse?.longitude ?? house.longitude) / 2;
    const label = polar(center, labelLongitude, 98 * radiusScale, ascLongitude);
    const isAxis = house.number === 1 || house.number === 10;
    context.page.drawLine({
      start: { x: line.x1, y: line.y1 },
      end: { x: line.x2, y: line.y2 },
      thickness: isAxis ? 0.9 : 0.35,
      color: isAxis ? context.rgb(0.84, 0.68, 0.25) : context.rgb(0.38, 0.34, 0.51)
    });
    context.page.drawText(String(house.number), {
      x: label.x - 4,
      y: label.y - 4,
      font: context.semibold,
      size: 8,
      color: context.rgb(0.52, 0.48, 0.62)
    });
    if (isAxis) {
      const axisPosition = polar(center, house.longitude, 184 * radiusScale, ascLongitude);
      context.page.drawText(house.number === 1 ? "Asc" : "MC", {
        x: axisPosition.x - 9,
        y: axisPosition.y - 4,
        font: context.semibold,
        size: 10,
        color: context.rgb(0.84, 0.68, 0.25)
      });
    }
  }
  for (const aspect of primary.aspects) {
    const pointA = primaryPoints.find((point) => point.id === aspect.pointA);
    const pointB = primaryPoints.find((point) => point.id === aspect.pointB);
    if (!pointA || !pointB) continue;
    const start = polar(center, pointA.longitude, aspectRadius, ascLongitude);
    const end = polar(center, pointB.longitude, aspectRadius, ascLongitude);
    context.page.drawLine({
      start,
      end,
      thickness: 0.45,
      color: aspectColor(aspect, context)
    });
  }
  for (const aspect of aspectsToPrimary) {
    const primaryPoint = primaryPoints.find((point) => point.id === aspect.primaryPoint);
    const overlayPoint = overlayPoints.find((point) => point.id === aspect.overlayPoint);
    if (!primaryPoint || !overlayPoint) continue;
    const start = polar(
      center,
      overlayMarkerLongitudes[overlayPoint.id] ?? overlayPoint.longitude,
      178 * radiusScale,
      ascLongitude
    );
    const end = polar(center, primaryPoint.longitude, aspectRadius, ascLongitude);
    context.page.drawLine({
      start,
      end,
      thickness: 0.65,
      color: aspectColor(aspect, context)
    });
  }
  drawWheelMarkers({
    context,
    center,
    ascLongitude,
    points: primaryPoints,
    markerLongitudes: primaryMarkerLongitudes,
    exactRadius: middleRadius,
    markerRadius: 142 * radiusScale,
    guideColor: context.rgb(0.5, 0.48, 0.61),
    dotBorderColor: context.rgb(0.56, 0.5, 0.72),
    labelColor: context.rgb(0.92, 0.9, 0.98)
  });
  drawWheelMarkers({
    context,
    center,
    ascLongitude,
    points: overlayPoints,
    markerLongitudes: overlayMarkerLongitudes,
    exactRadius: middleRadius,
    markerRadius: 178 * radiusScale,
    guideColor: context.rgb(0.84, 0.68, 0.25),
    dotBorderColor: context.rgb(0.84, 0.68, 0.25),
    labelColor: context.rgb(0.98, 0.93, 0.64)
  });
  context.page.drawText(labels.overlayWheelCaption, {
    x: context.x + 18,
    y: context.y + 16,
    font: context.regular,
    size: 8,
    color: context.colors.muted
  });
}

function drawAstrocartographyMap(
  context: PdfGraphicContext,
  lines: readonly ChartAstrocartographyLine[],
  labels: Labels
): void {
  const map = {
    x: context.x + 16,
    y: context.y + 42,
    width: context.width - 32,
    height: context.height - 72
  };

  context.page.drawRectangle({
    x: context.x,
    y: context.y,
    width: context.width,
    height: context.height,
    color: context.colors.surface,
    borderColor: context.colors.border,
    borderWidth: 0.6
  });
  context.page.drawRectangle({
    x: map.x,
    y: map.y,
    width: map.width,
    height: map.height,
    color: context.rgb(0.08, 0.08, 0.16),
    borderColor: context.rgb(0.24, 0.21, 0.35),
    borderWidth: 0.6
  });
  for (const longitude of [-120, -60, 0, 60, 120]) {
    const x = projectAstrocartographyLongitude(map, longitude);
    context.page.drawLine({
      start: { x, y: map.y },
      end: { x, y: map.y + map.height },
      thickness: 0.35,
      color: context.rgb(0.18, 0.17, 0.28)
    });
  }
  for (const latitude of [-60, -30, 0, 30, 60]) {
    const y = projectAstrocartographyLatitude(map, latitude);
    context.page.drawLine({
      start: { x: map.x, y },
      end: { x: map.x + map.width, y },
      thickness: 0.35,
      color: context.rgb(0.18, 0.17, 0.28)
    });
  }

  for (const line of lines) {
    const color = astrocartographyAngleColor(line.angle, context);
    for (const segment of splitAstrocartographyPathAtAntimeridian(line.path)) {
      for (let index = 1; index < segment.length; index += 1) {
        const previous = segment[index - 1]!;
        const current = segment[index]!;
        context.page.drawLine({
          start: projectAstrocartographyPoint(map, previous),
          end: projectAstrocartographyPoint(map, current),
          thickness: 0.75,
          color,
          opacity: 0.82
        });
      }
    }
  }

  const legend = [
    { angle: "mc", label: labels.angles.mc ?? "MC" },
    { angle: "ic", label: labels.angles.ic ?? "IC" },
    { angle: "asc", label: labels.angles.asc ?? "Asc" },
    { angle: "dsc", label: labels.angles.dsc ?? "Dsc" }
  ] as const;
  legend.forEach((item, index) => {
    const x = map.x + index * 72;
    const y = context.y + 19;
    context.page.drawLine({
      start: { x, y: y + 3 },
      end: { x: x + 20, y: y + 3 },
      thickness: 1.4,
      color: astrocartographyAngleColor(item.angle, context)
    });
    context.page.drawText(item.label, {
      x: x + 26,
      y,
      font: context.semibold,
      size: 8,
      color: context.colors.ink
    });
  });
  context.page.drawText(labels.astrocartographyMapCaption(lines.length), {
    x: map.x,
    y: map.y + map.height + 12,
    font: context.regular,
    size: 8,
    color: context.colors.muted
  });
}

function drawWheelMarkers(input: {
  readonly context: PdfGraphicContext;
  readonly center: { readonly x: number; readonly y: number };
  readonly ascLongitude: number;
  readonly points: readonly ChartPoint[];
  readonly markerLongitudes: Readonly<Record<string, number>>;
  readonly exactRadius: number;
  readonly markerRadius: number;
  readonly guideColor: ReturnType<PdfGraphicContext["rgb"]>;
  readonly dotBorderColor: ReturnType<PdfGraphicContext["rgb"]>;
  readonly labelColor: ReturnType<PdfGraphicContext["rgb"]>;
}): void {
  for (const point of input.points) {
    if (axisPointIds.has(point.id)) continue;
    const exact = polar(input.center, point.longitude, input.exactRadius, input.ascLongitude);
    const marker = polar(
      input.center,
      input.markerLongitudes[point.id] ?? point.longitude,
      input.markerRadius,
      input.ascLongitude
    );
    input.context.page.drawLine({
      start: exact,
      end: marker,
      thickness: 0.35,
      color: input.guideColor
    });
    input.context.page.drawCircle({
      x: marker.x,
      y: marker.y,
      size: 10,
      color: input.context.rgb(0.18, 0.15, 0.28),
      borderColor: input.dotBorderColor,
      borderWidth: 0.75
    });
    input.context.page.drawText(pointGlyph(point.id), {
      x: marker.x - 5.5,
      y: marker.y - 4,
      font: input.context.semibold,
      size: 7.3,
      color: input.labelColor
    });
    if (point.retrograde) {
      input.context.page.drawText("R", {
        x: marker.x + 9,
        y: marker.y + 7,
        font: input.context.semibold,
        size: 6,
        color: input.context.rgb(0.84, 0.68, 0.25)
      });
    }
  }
}

function pointRow(point: ChartPoint, labels: Labels): readonly string[] {
  const position = formatZodiacPosition(point.sign, point.signDegree);

  return [
    labels.pointsById[point.id] ?? point.label,
    labels.signs[position.sign] ?? position.sign,
    position.degree,
    point.house ? labels.houseValue(point.house) : labels.noHouse,
    point.retrograde ? labels.retrograde : labels.direct
  ];
}

function houseRow(house: ChartHouse, labels: Labels): readonly string[] {
  const position = formatZodiacPosition(house.sign, house.signDegree);

  return [
    labels.houseValue(house.number),
    labels.signs[position.sign] ?? position.sign,
    position.degree
  ];
}

function aspectRow(aspect: ChartAspect, labels: Labels): readonly string[] {
  return [
    labels.pointsById[aspect.pointA] ?? aspect.pointA,
    labels.aspectTypes[aspect.type] ?? aspect.type,
    labels.pointsById[aspect.pointB] ?? aspect.pointB,
    formatDegreeMinutes(aspect.orb),
    aspect.strength == null ? labels.notAvailable : `${Math.round(aspect.strength * 100)}%`
  ];
}

function distributionRows(
  result: ChartRenderResult,
  labels: Labels
): readonly (readonly string[])[] {
  const distributions = result.distributions;
  return [
    [labels.fire, String(distributions.elements.fire)],
    [labels.earth, String(distributions.elements.earth)],
    [labels.air, String(distributions.elements.air)],
    [labels.water, String(distributions.elements.water)],
    [labels.cardinal, String(distributions.modalities.cardinal)],
    [labels.fixed, String(distributions.modalities.fixed)],
    [labels.mutable, String(distributions.modalities.mutable)],
    [labels.masculine, String(distributions.polarity.masculine)],
    [labels.feminine, String(distributions.polarity.feminine)]
  ];
}

function transitAspectRow(aspect: ChartTransitAspect, labels: Labels): readonly string[] {
  return crossChartAspectRow(aspect.transitPoint, aspect.type, aspect.natalPoint, aspect, labels);
}

function solarReturnAspectRow(aspect: ChartSolarReturnAspect, labels: Labels): readonly string[] {
  return crossChartAspectRow(
    aspect.solarReturnPoint,
    aspect.type,
    aspect.natalPoint,
    aspect,
    labels
  );
}

function progressionAspectRow(
  aspect: {
    readonly progressedPoint: string;
    readonly natalPoint: string;
    readonly type: string;
    readonly orb: number;
    readonly strength?: number | null;
  },
  labels: Labels
): readonly string[] {
  return crossChartAspectRow(
    aspect.progressedPoint,
    aspect.type,
    aspect.natalPoint,
    aspect,
    labels
  );
}

function synastryAspectRow(aspect: ChartSynastryAspect, labels: Labels): readonly string[] {
  return crossChartAspectRow(aspect.primaryPoint, aspect.type, aspect.partnerPoint, aspect, labels);
}

function crossChartAspectRow(
  pointA: string,
  type: string,
  pointB: string,
  aspect: { readonly orb: number; readonly strength?: number | null },
  labels: Labels
): readonly string[] {
  return [
    labels.pointsById[pointA] ?? pointA,
    labels.aspectTypes[type] ?? type,
    labels.pointsById[pointB] ?? pointB,
    formatDegreeMinutes(aspect.orb),
    aspect.strength == null ? labels.notAvailable : `${Math.round(aspect.strength * 100)}%`
  ];
}

function astrocartographyLineRow(
  line: ChartAstrocartographyLine,
  labels: Labels
): readonly string[] {
  return [
    labels.pointsById[line.point] ?? line.point,
    labels.angles[line.angle] ?? line.angle.toUpperCase(),
    line.label,
    String(line.path.length)
  ];
}

function buildInterpretationRows(
  interpretations: readonly ChartPdfInterpretation[],
  labels: Labels
): readonly (readonly string[])[] {
  return interpretations
    .slice(0, 28)
    .map((interpretation) => [
      interpretation.label,
      `${interpretation.meta} · ${interpretation.position}`,
      interpretation.entry?.content ?? labels.missingInterpretationText(interpretation.code),
      interpretation.entry
        ? `${labels.dictionary} · ${interpretation.entry.source}`
        : labels.noEntry
    ]);
}

function polar(
  center: { readonly x: number; readonly y: number },
  longitude: number,
  radius: number,
  ascLongitude: number
): { readonly x: number; readonly y: number } {
  const radians = ((180 + (longitude - ascLongitude)) * Math.PI) / 180;

  return {
    x: center.x + Math.cos(radians) * radius,
    y: center.y - Math.sin(radians) * radius
  };
}

function radialLine(
  center: { readonly x: number; readonly y: number },
  longitude: number,
  innerRadius: number,
  outerRadius: number,
  ascLongitude: number
): { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } {
  const inner = polar(center, longitude, innerRadius, ascLongitude);
  const outer = polar(center, longitude, outerRadius, ascLongitude);

  return { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y };
}

function spreadPointLongitudes(
  points: readonly ChartPoint[],
  minSeparation = 7.5
): Record<string, number> {
  const sorted = points
    .map((point) => ({ id: point.id, longitude: normalizeLongitude(point.longitude) }))
    .sort((a, b) => a.longitude - b.longitude);
  if (sorted.length < 2) {
    return Object.fromEntries(sorted.map((point) => [point.id, point.longitude]));
  }

  for (let iteration = 0; iteration < 60; iteration += 1) {
    let moved = false;
    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index]!;
      const next = sorted[(index + 1) % sorted.length]!;
      const distance =
        index === sorted.length - 1
          ? next.longitude + 360 - current.longitude
          : next.longitude - current.longitude;
      if (distance < minSeparation) {
        const push = (minSeparation - distance) / 2;
        current.longitude -= push;
        next.longitude += push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return Object.fromEntries(sorted.map((point) => [point.id, normalizeLongitude(point.longitude)]));
}

function normalizeLongitude(longitude: number): number {
  return ((longitude % 360) + 360) % 360;
}

function arcDistance(from: number, to: number): number {
  return normalizeLongitude(to - from);
}

type AstrocartographyPathPoint = ChartAstrocartographyLine["path"][number];
type AstrocartographyMapBox = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

function splitAstrocartographyPathAtAntimeridian(
  path: readonly AstrocartographyPathPoint[]
): readonly (readonly AstrocartographyPathPoint[])[] {
  const first = path[0];
  if (!first) return [];

  const segments: AstrocartographyPathPoint[][] = [];
  let segment: AstrocartographyPathPoint[] = [first];
  let previous = first;
  for (const current of path.slice(1)) {
    const longitudeDelta = current.longitude - previous.longitude;
    if (Math.abs(longitudeDelta) <= 180) {
      segment.push(current);
      previous = current;
      continue;
    }

    const crossesEast = longitudeDelta < -180;
    const adjustedLongitude = current.longitude + (crossesEast ? 360 : -360);
    const boundaryLongitude = crossesEast ? 180 : -180;
    const facingBoundaryLongitude = crossesEast ? -180 : 180;
    const ratio =
      (boundaryLongitude - previous.longitude) / (adjustedLongitude - previous.longitude);
    const boundaryLatitude = previous.latitude + (current.latitude - previous.latitude) * ratio;

    segment.push({ latitude: boundaryLatitude, longitude: boundaryLongitude });
    if (segment.length >= 2) segments.push(segment);
    segment = [{ latitude: boundaryLatitude, longitude: facingBoundaryLongitude }, current];
    previous = current;
  }

  if (segment.length >= 2) segments.push(segment);
  return segments;
}

function projectAstrocartographyPoint(
  map: AstrocartographyMapBox,
  point: AstrocartographyPathPoint
): { readonly x: number; readonly y: number } {
  return {
    x: projectAstrocartographyLongitude(map, point.longitude),
    y: projectAstrocartographyLatitude(map, point.latitude)
  };
}

function projectAstrocartographyLongitude(map: AstrocartographyMapBox, longitude: number): number {
  return map.x + ((longitude + 180) / 360) * map.width;
}

function projectAstrocartographyLatitude(map: AstrocartographyMapBox, latitude: number): number {
  return map.y + ((latitude + 90) / 180) * map.height;
}

function astrocartographyAngleColor(
  angle: ChartAstrocartographyLine["angle"],
  context: PdfGraphicContext
): ReturnType<PdfGraphicContext["rgb"]> {
  if (angle === "mc") return context.rgb(0.91, 0.78, 0.34);
  if (angle === "ic") return context.rgb(0.67, 0.54, 0.95);
  if (angle === "asc") return context.rgb(0.38, 0.55, 0.9);
  return context.rgb(0.82, 0.39, 0.43);
}

function aspectColor(
  aspect: { readonly type: string },
  context: PdfGraphicContext
): ReturnType<typeof context.rgb> {
  if (aspect.type === "square" || aspect.type === "opposition" || aspect.type === "semi-square") {
    return context.rgb(0.77, 0.31, 0.34);
  }
  if (aspect.type === "conjunction") {
    return context.rgb(0.7, 0.58, 0.25);
  }
  return context.rgb(0.25, 0.49, 0.75);
}

function pointGlyph(pointId: string): string {
  return pointGlyphs[pointId] ?? pointId.slice(0, 2).toUpperCase();
}

type Labels = {
  readonly title: string;
  readonly subtitle: string;
  readonly chartType: string;
  readonly chartTypes: Readonly<Record<string, string>>;
  readonly calculation: string;
  readonly chartWheel: string;
  readonly chartWheelCaption: string;
  readonly overlayWheelCaption: string;
  readonly synastryWheel: string;
  readonly synastryWheelCaption: string;
  readonly transitWheel: string;
  readonly solarReturnWheel: string;
  readonly progressionWheel: string;
  readonly calculationTitle: string;
  readonly houseSystem: string;
  readonly nodes: string;
  readonly orbs: string;
  readonly birthData: string;
  readonly birthDate: string;
  readonly birthTime: string;
  readonly timezone: string;
  readonly place: string;
  readonly timePrecision: string;
  readonly questionData: string;
  readonly question: string;
  readonly category: string;
  readonly eventMoment: string;
  readonly returnData: string;
  readonly progressionData: string;
  readonly year: string;
  readonly resolvedAt: string;
  readonly targetDate: string;
  readonly progressionType: string;
  readonly symbolicDate: string;
  readonly natalChart: string;
  readonly transitChart: string;
  readonly solarReturnChart: string;
  readonly progressedChart: string;
  readonly primaryChart: string;
  readonly partnerChart: string;
  readonly points: string;
  readonly point: string;
  readonly angle: string;
  readonly name: string;
  readonly pathPoints: string;
  readonly sign: string;
  readonly position: string;
  readonly house: string;
  readonly motion: string;
  readonly houses: string;
  readonly aspects: string;
  readonly aspectsToNatal: string;
  readonly aspectsBetween: string;
  readonly houseOverlays: string;
  readonly pointA: string;
  readonly pointB: string;
  readonly aspect: string;
  readonly orb: string;
  readonly strength: string;
  readonly distributions: string;
  readonly aiInterpretation: string;
  readonly factor: string;
  readonly value: string;
  readonly warnings: string;
  readonly dictionaryInterpretations: string;
  readonly interpretationPosition: string;
  readonly interpretationContext: string;
  readonly interpretationText: string;
  readonly interpretationSource: string;
  readonly dictionary: string;
  readonly noEntry: string;
  readonly missingInterpretationText: (code: string) => string;
  readonly code: string;
  readonly message: string;
  readonly direct: string;
  readonly retrograde: string;
  readonly noHouse: string;
  readonly notAvailable: string;
  readonly fire: string;
  readonly earth: string;
  readonly air: string;
  readonly water: string;
  readonly cardinal: string;
  readonly fixed: string;
  readonly mutable: string;
  readonly masculine: string;
  readonly feminine: string;
  readonly owner: string;
  readonly projectedHouseOwner: string;
  readonly astrocartographyMap: string;
  readonly astrocartographyMapCaption: (lineCount: number) => string;
  readonly astrocartographyLines: string;
  readonly houseValue: (house: number) => string;
  readonly houseSystems: Readonly<Record<string, string>>;
  readonly nodeTypes: Readonly<Record<string, string>>;
  readonly timePrecisions: Readonly<Record<string, string>>;
  readonly pointsById: Readonly<Record<string, string>>;
  readonly signs: Readonly<Record<string, string>>;
  readonly aspectTypes: Readonly<Record<string, string>>;
  readonly angles: Readonly<Record<string, string>>;
  readonly relationshipOwners: Readonly<Record<string, string>>;
};

const ru: Labels = {
  title: "Натальная карта",
  subtitle: "Детерминированный отчёт по текущему расчёту ElevenHouse",
  chartType: "Тип карты",
  chartTypes: {
    natal: "Натальная карта",
    astrocartography: "Астрография",
    transit: "Транзиты",
    synastry: "Синастрия",
    composite: "Композит",
    solar_return: "Соляр",
    progression: "Прогрессии",
    horary: "Хорар"
  },
  calculation: "Расчёт",
  chartWheel: "Колесо карты",
  chartWheelCaption: "Векторная схема: дома, оси, планеты и основные аспекты текущего расчёта.",
  overlayWheelCaption:
    "Совмещённая схема: натальная карта внутри, сравниваемая карта снаружи, линии показывают аспекты к натальной карте.",
  synastryWheel: "Синастрия · Колесо карты",
  synastryWheelCaption:
    "Совмещённая схема: карта клиента внутри, карта партнёра снаружи, линии показывают аспекты между картами.",
  transitWheel: "Транзиты · Колесо карты",
  solarReturnWheel: "Соляр · Колесо карты",
  progressionWheel: "Прогрессии · Колесо карты",
  calculationTitle: "Название",
  houseSystem: "Система домов",
  nodes: "Узлы",
  orbs: "Орбы",
  birthData: "Данные рождения",
  birthDate: "Дата",
  birthTime: "Время",
  timezone: "Часовой пояс",
  place: "Место",
  timePrecision: "Точность времени",
  questionData: "Данные вопроса",
  question: "Вопрос",
  category: "Категория",
  eventMoment: "Момент события",
  returnData: "Данные соляра",
  progressionData: "Данные прогрессии",
  year: "Год",
  resolvedAt: "Точный момент",
  targetDate: "Целевая дата",
  progressionType: "Тип прогрессии",
  symbolicDate: "Символическая дата",
  natalChart: "Натальная карта",
  transitChart: "Транзитная карта",
  solarReturnChart: "Карта соляра",
  progressedChart: "Прогрессивная карта",
  primaryChart: "Карта клиента",
  partnerChart: "Карта партнёра",
  points: "Планеты и точки",
  point: "Точка",
  angle: "Угол",
  name: "Название",
  pathPoints: "Точек линии",
  sign: "Знак",
  position: "Позиция",
  house: "Дом",
  motion: "Движение",
  houses: "Дома",
  aspects: "Аспекты",
  aspectsToNatal: "Аспекты к натальной карте",
  aspectsBetween: "Аспекты между картами",
  houseOverlays: "Наложение домов",
  pointA: "Точка A",
  pointB: "Точка B",
  aspect: "Аспект",
  orb: "Орб",
  strength: "Сила",
  distributions: "Распределения",
  aiInterpretation: "AI-трактовка",
  factor: "Фактор",
  value: "Значение",
  warnings: "Предупреждения",
  dictionaryInterpretations: "Трактовки из справочника",
  interpretationPosition: "Положение",
  interpretationContext: "Контекст",
  interpretationText: "Трактовка",
  interpretationSource: "Источник",
  dictionary: "Справочник",
  noEntry: "Нет записи",
  missingInterpretationText: (code: string) =>
    `Трактовка отсутствует. Создайте её в справочнике: ${code}`,
  code: "Код",
  message: "Сообщение",
  direct: "D",
  retrograde: "R",
  noHouse: "—",
  notAvailable: "—",
  fire: "Огонь",
  earth: "Земля",
  air: "Воздух",
  water: "Вода",
  cardinal: "Кардинальный",
  fixed: "Фиксированный",
  mutable: "Мутабельный",
  masculine: "Мужская",
  feminine: "Женская",
  owner: "Владелец",
  projectedHouseOwner: "Чьи дома",
  astrocartographyMap: "Астрография · Карта линий",
  astrocartographyMapCaption: (lineCount: number) =>
    `Векторная карта линий: ${lineCount} линий MC, IC, Asc и Dsc по текущему расчёту.`,
  astrocartographyLines: "Линии астрографии",
  houseValue: (house: number) => `${house} дом`,
  houseSystems: {
    placidus: "Плацидус",
    koch: "Кох",
    whole_sign: "Целый знак",
    equal: "Равнодомная",
    regiomontanus: "Региомонтан"
  },
  nodeTypes: { true: "Истинный", mean: "Средний" },
  timePrecisions: { exact: "Точное", approximate: "Примерное" },
  pointsById: {
    sun: "Солнце",
    moon: "Луна",
    mercury: "Меркурий",
    venus: "Венера",
    mars: "Марс",
    jupiter: "Юпитер",
    saturn: "Сатурн",
    uranus: "Уран",
    neptune: "Нептун",
    pluto: "Плутон",
    ascendant: "Асцендент",
    midheaven: "Середина неба",
    north_node: "Северный узел",
    south_node: "Южный узел"
  },
  signs: {
    aries: "Овен",
    taurus: "Телец",
    gemini: "Близнецы",
    cancer: "Рак",
    leo: "Лев",
    virgo: "Дева",
    libra: "Весы",
    scorpio: "Скорпион",
    sagittarius: "Стрелец",
    capricorn: "Козерог",
    aquarius: "Водолей",
    pisces: "Рыбы"
  },
  aspectTypes: {
    conjunction: "Соединение",
    opposition: "Оппозиция",
    trine: "Трин",
    square: "Квадрат",
    sextile: "Секстиль"
  },
  angles: { asc: "Asc", dsc: "Dsc", mc: "MC", ic: "IC" },
  relationshipOwners: { primary: "Клиент", partner: "Партнёр" }
};

const en: Labels = {
  ...ru,
  title: "Natal chart",
  subtitle: "Deterministic report for the current ElevenHouse calculation",
  chartType: "Chart type",
  chartTypes: {
    natal: "Natal chart",
    astrocartography: "Astrocartography",
    transit: "Transits",
    synastry: "Synastry",
    composite: "Composite",
    solar_return: "Solar return",
    progression: "Progressions",
    horary: "Horary"
  },
  calculation: "Calculation",
  chartWheel: "Chart wheel",
  chartWheelCaption:
    "Vector map: houses, axes, planets and major aspects for the current calculation.",
  overlayWheelCaption:
    "Combined map: natal chart inside, comparison chart outside, lines show aspects to the natal chart.",
  synastryWheel: "Synastry chart wheel",
  synastryWheelCaption:
    "Combined map: client chart inside, partner chart outside, lines show aspects between charts.",
  transitWheel: "Transits chart wheel",
  solarReturnWheel: "Solar return chart wheel",
  progressionWheel: "Progressions chart wheel",
  calculationTitle: "Title",
  houseSystem: "House system",
  nodes: "Nodes",
  orbs: "Orbs",
  birthData: "Birth data",
  birthDate: "Date",
  birthTime: "Time",
  timezone: "Timezone",
  place: "Place",
  timePrecision: "Time precision",
  questionData: "Question data",
  question: "Question",
  category: "Category",
  eventMoment: "Event moment",
  returnData: "Solar return data",
  progressionData: "Progression data",
  year: "Year",
  resolvedAt: "Exact moment",
  targetDate: "Target date",
  progressionType: "Progression type",
  symbolicDate: "Symbolic date",
  natalChart: "Natal chart",
  transitChart: "Transit chart",
  solarReturnChart: "Solar return chart",
  progressedChart: "Progressed chart",
  primaryChart: "Client chart",
  partnerChart: "Partner chart",
  points: "Planets and points",
  point: "Point",
  angle: "Angle",
  name: "Name",
  pathPoints: "Path points",
  sign: "Sign",
  position: "Position",
  house: "House",
  motion: "Motion",
  houses: "Houses",
  aspects: "Aspects",
  aspectsToNatal: "Aspects to natal chart",
  aspectsBetween: "Aspects between charts",
  houseOverlays: "House overlays",
  pointA: "Point A",
  pointB: "Point B",
  aspect: "Aspect",
  orb: "Orb",
  strength: "Strength",
  distributions: "Distributions",
  aiInterpretation: "AI interpretation",
  factor: "Factor",
  value: "Value",
  warnings: "Warnings",
  dictionaryInterpretations: "Dictionary interpretations",
  interpretationPosition: "Position",
  interpretationContext: "Context",
  interpretationText: "Interpretation",
  interpretationSource: "Source",
  dictionary: "Dictionary",
  noEntry: "No entry",
  missingInterpretationText: (code: string) =>
    `Interpretation is missing. Create it in the dictionary: ${code}`,
  code: "Code",
  message: "Message",
  fire: "Fire",
  earth: "Earth",
  air: "Air",
  water: "Water",
  cardinal: "Cardinal",
  fixed: "Fixed",
  mutable: "Mutable",
  masculine: "Masculine",
  feminine: "Feminine",
  owner: "Owner",
  projectedHouseOwner: "House owner",
  astrocartographyMap: "Astrocartography line map",
  astrocartographyMapCaption: (lineCount: number) =>
    `Vector line map: ${lineCount} MC, IC, Asc and Dsc lines for the current calculation.`,
  astrocartographyLines: "Astrocartography lines",
  houseValue: (house: number) => `House ${house}`,
  houseSystems: {
    placidus: "Placidus",
    koch: "Koch",
    whole_sign: "Whole sign",
    equal: "Equal",
    regiomontanus: "Regiomontanus"
  },
  nodeTypes: { true: "True", mean: "Mean" },
  timePrecisions: { exact: "Exact", approximate: "Approximate" },
  pointsById: {
    sun: "Sun",
    moon: "Moon",
    mercury: "Mercury",
    venus: "Venus",
    mars: "Mars",
    jupiter: "Jupiter",
    saturn: "Saturn",
    uranus: "Uranus",
    neptune: "Neptune",
    pluto: "Pluto",
    ascendant: "Ascendant",
    midheaven: "Midheaven",
    north_node: "North node",
    south_node: "South node"
  },
  signs: {
    aries: "Aries",
    taurus: "Taurus",
    gemini: "Gemini",
    cancer: "Cancer",
    leo: "Leo",
    virgo: "Virgo",
    libra: "Libra",
    scorpio: "Scorpio",
    sagittarius: "Sagittarius",
    capricorn: "Capricorn",
    aquarius: "Aquarius",
    pisces: "Pisces"
  },
  aspectTypes: {
    conjunction: "Conjunction",
    opposition: "Opposition",
    trine: "Trine",
    square: "Square",
    sextile: "Sextile"
  },
  angles: { asc: "Asc", dsc: "Dsc", mc: "MC", ic: "IC" },
  relationshipOwners: { primary: "Client", partner: "Partner" }
};

const axisPointIds = new Set(["ascendant", "midheaven"]);

const pointGlyphs: Record<string, string> = {
  sun: "Su",
  moon: "Mo",
  mercury: "Me",
  venus: "Ve",
  mars: "Ma",
  jupiter: "Ju",
  saturn: "Sa",
  uranus: "Ur",
  neptune: "Ne",
  pluto: "Pl",
  north_node: "NN",
  south_node: "SN"
};

const zodiacLabels = [
  { label: "Ar", color: (color: typeof import("pdf-lib").rgb) => color(0.82, 0.42, 0.32) },
  { label: "Ta", color: (color: typeof import("pdf-lib").rgb) => color(0.48, 0.63, 0.32) },
  { label: "Ge", color: (color: typeof import("pdf-lib").rgb) => color(0.83, 0.67, 0.25) },
  { label: "Ca", color: (color: typeof import("pdf-lib").rgb) => color(0.42, 0.57, 0.86) },
  { label: "Le", color: (color: typeof import("pdf-lib").rgb) => color(0.82, 0.42, 0.32) },
  { label: "Vi", color: (color: typeof import("pdf-lib").rgb) => color(0.48, 0.63, 0.32) },
  { label: "Li", color: (color: typeof import("pdf-lib").rgb) => color(0.83, 0.67, 0.25) },
  { label: "Sc", color: (color: typeof import("pdf-lib").rgb) => color(0.42, 0.57, 0.86) },
  { label: "Sg", color: (color: typeof import("pdf-lib").rgb) => color(0.82, 0.42, 0.32) },
  { label: "Cp", color: (color: typeof import("pdf-lib").rgb) => color(0.48, 0.63, 0.32) },
  { label: "Aq", color: (color: typeof import("pdf-lib").rgb) => color(0.83, 0.67, 0.25) },
  { label: "Pi", color: (color: typeof import("pdf-lib").rgb) => color(0.42, 0.57, 0.86) }
] as const;
