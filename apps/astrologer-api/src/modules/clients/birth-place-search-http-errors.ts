import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  BirthPlaceReferenceInvalidError,
  BirthPlaceReferenceNotFoundError,
  BirthPlaceReferenceUnavailableError,
  BirthPlaceSearchRateLimitError,
  BirthPlaceSearchUnavailableError
} from "@elevenhouse/birth-place-search";

export function translateBirthPlaceSearchError(error: unknown): Error {
  if (error instanceof BirthPlaceReferenceInvalidError) {
    return new BadRequestException({ code: error.code, message: error.message });
  }
  if (error instanceof BirthPlaceReferenceNotFoundError) {
    return new NotFoundException({ code: error.code, message: error.message });
  }
  if (error instanceof BirthPlaceReferenceUnavailableError) {
    return new ServiceUnavailableException({ code: error.code, message: error.message });
  }
  if (error instanceof BirthPlaceSearchRateLimitError) {
    return new HttpException(
      {
        code: error.code,
        message: error.message,
        retryAfterSeconds: error.retryAfterSeconds
      },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
  if (error instanceof BirthPlaceSearchUnavailableError) {
    return new ServiceUnavailableException({ code: error.code, message: error.message });
  }
  return new ServiceUnavailableException({
    code: "BIRTH_PLACE_SEARCH_UNAVAILABLE",
    message: "Birth place search is unavailable"
  });
}
