export type AstrocartographyPathPoint = {
  readonly latitude: number;
  readonly longitude: number;
};

export function splitAstrocartographyPathAtAntimeridian(
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
