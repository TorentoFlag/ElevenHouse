import type { ClientBirthPlaceSearchResponse } from "@elevenhouse/contracts";

export type BirthPlaceSearchInput = {
  readonly query: string;
  readonly limit: number;
};

export type ClientBirthPlaceSearchProvider = {
  search(input: BirthPlaceSearchInput): Promise<ClientBirthPlaceSearchResponse>;
};
