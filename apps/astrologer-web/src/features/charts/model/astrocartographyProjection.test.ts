import { describe, expect, it } from "vitest";
import { splitAstrocartographyPathAtAntimeridian } from "./astrocartographyProjection";

describe("astrocartography projection", () => {
  it.each([
    [
      "eastbound",
      [
        { latitude: -10, longitude: 170 },
        { latitude: 10, longitude: -170 }
      ],
      180,
      -180
    ],
    [
      "westbound",
      [
        { latitude: -10, longitude: -170 },
        { latitude: 10, longitude: 170 }
      ],
      -180,
      180
    ]
  ] as const)("clips an %s line at both facing antimeridian edges", (_label, path, left, right) => {
    const segments = splitAstrocartographyPathAtAntimeridian(path);

    expect(segments).toHaveLength(2);
    expect(segments[0]?.at(-1)).toEqual({ latitude: 0, longitude: left });
    expect(segments[1]?.[0]).toEqual({ latitude: 0, longitude: right });
    expect(
      segments.every((segment) =>
        segment.slice(1).every((point, index) => {
          const previous = segment[index];
          return previous !== undefined && Math.abs(point.longitude - previous.longitude) <= 180;
        })
      )
    ).toBe(true);
  });

  it("preserves an ordinary path as one segment", () => {
    const path = [
      { latitude: -20, longitude: -30 },
      { latitude: 0, longitude: 0 },
      { latitude: 20, longitude: 30 }
    ];

    expect(splitAstrocartographyPathAtAntimeridian(path)).toEqual([path]);
  });
});
