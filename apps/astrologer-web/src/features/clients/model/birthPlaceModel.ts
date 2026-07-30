import type {
  ClientBirthDataUpsertRequest,
  ClientBirthPlaceCandidate
} from "@elevenhouse/contracts";

export type BirthPlaceDraftPatch = Pick<
  ClientBirthDataUpsertRequest,
  | "birthPlaceText"
  | "birthCountryCode"
  | "birthCity"
  | "birthRegion"
  | "birthTimezone"
  | "birthLatitude"
  | "birthLongitude"
>;

export function toBirthPlaceDraftPatch(candidate: ClientBirthPlaceCandidate): BirthPlaceDraftPatch {
  return {
    birthPlaceText: candidate.placeName,
    birthCountryCode: candidate.countryCode,
    birthCity: candidate.city,
    birthRegion: candidate.region,
    birthTimezone: candidate.timezone,
    birthLatitude: candidate.latitude,
    birthLongitude: candidate.longitude
  };
}
