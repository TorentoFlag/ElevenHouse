const zodiacSigns = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces"
] as const;

const minutesPerSign = 30 * 60;

export function formatDegreeMinutes(value: number): string {
  const totalMinutes = Math.round(value * 60);
  const prefix = totalMinutes < 0 ? "-" : "";
  const absoluteMinutes = Math.abs(totalMinutes);
  const degrees = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  return `${prefix}${degrees}°${String(minutes).padStart(2, "0")}'`;
}

export function formatZodiacPosition(
  sign: string,
  signDegree: number
): { readonly sign: string; readonly degree: string } {
  const totalMinutes = Math.round(signDegree * 60);
  const signOffset = Math.floor(totalMinutes / minutesPerSign);
  const minutesWithinSign = positiveModulo(totalMinutes, minutesPerSign);

  return {
    sign: signOffset === 0 ? sign : advanceZodiacSign(sign, signOffset),
    degree: formatDegreeMinutes(minutesWithinSign / 60)
  };
}

function advanceZodiacSign(sign: string, offset: number): string {
  const normalizedSign = sign.trim().toLowerCase().replaceAll("-", "_");
  const signIndex = zodiacSigns.indexOf(normalizedSign as (typeof zodiacSigns)[number]);
  if (signIndex === -1) {
    throw new Error(`Cannot carry rounded zodiac position for unknown sign: ${sign}`);
  }

  return zodiacSigns[positiveModulo(signIndex + offset, zodiacSigns.length)]!;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
