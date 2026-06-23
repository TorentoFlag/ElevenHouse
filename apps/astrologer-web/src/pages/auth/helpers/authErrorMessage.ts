import { HttpError } from "../../../common/http/HttpError";

type AuthErrorCopy = {
  readonly errors: {
    readonly invalidCode: string;
    readonly identityExists: string;
    readonly rateLimited: string;
    readonly generic: string;
  };
};

export function resolveAuthErrorMessage(error: unknown, copy: AuthErrorCopy): string {
  if (error instanceof HttpError) {
    if (error.status === 401) {
      return copy.errors.invalidCode;
    }

    if (error.status === 409) {
      return copy.errors.identityExists;
    }

    if (error.status === 429) {
      return copy.errors.rateLimited;
    }
  }

  return copy.errors.generic;
}
