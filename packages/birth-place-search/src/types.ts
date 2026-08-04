import type {
  ClientBirthPlaceCandidate,
  ClientBirthPlaceSearchResponse
} from "@elevenhouse/contracts";

export type BirthPlaceSearchInput = {
  readonly ownerUserId?: string;
  readonly query: string;
  readonly limit: number;
};

export type BirthPlaceSearchProvider = {
  search(input: BirthPlaceSearchInput): Promise<ClientBirthPlaceSearchResponse>;
};

export type BirthPlaceReferenceInput = {
  readonly ownerUserId?: string;
  readonly provider: "geoapify";
  readonly providerPlaceId: string;
};

export type BirthPlaceOpaqueReferenceProvider = {
  resolveReference(providerPlaceId: string): Promise<ClientBirthPlaceCandidate>;
};

export type BirthPlaceUpstreamProvider = BirthPlaceSearchProvider &
  BirthPlaceOpaqueReferenceProvider;

export type BirthPlaceProvider = BirthPlaceSearchProvider & {
  resolveReference(input: BirthPlaceReferenceInput): Promise<ClientBirthPlaceCandidate>;
};
