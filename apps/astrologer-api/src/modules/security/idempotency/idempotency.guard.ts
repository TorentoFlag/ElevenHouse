import {
  BadRequestException,
  Injectable,
  type CanActivate,
  type ExecutionContext
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  idempotencyRequiredMetadataKey,
  type IdempotencyRequirement
} from "../route-policy/route-security-metadata";

type IdempotencyRequest = {
  readonly headers?: Record<string, string | readonly string[] | undefined>;
  readonly headersDistinct?: Record<string, readonly string[] | undefined>;
  readonly rawHeaders?: readonly string[];
};

@Injectable()
export class IdempotencyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<IdempotencyRequirement>(
      idempotencyRequiredMetadataKey,
      [context.getHandler(), context.getClass()]
    );
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest<IdempotencyRequest>();
    const idempotencyKey = readSingleIdempotencyKey(request);
    if (!idempotencyKey || !isValidIdempotencyKey(idempotencyKey)) {
      throw new BadRequestException("Valid Idempotency-Key header is required");
    }
    return true;
  }
}

function readSingleIdempotencyKey(request: IdempotencyRequest): string | undefined {
  const distinctValues = request.headersDistinct?.["idempotency-key"];
  if (distinctValues !== undefined) {
    return normalizeHeaderValues(distinctValues);
  }

  const rawValues = readRawHeaderValues(request.rawHeaders, "idempotency-key");
  if (rawValues.length > 0) {
    return normalizeHeaderValues(rawValues);
  }

  return normalizeHeaderValue(request.headers?.["idempotency-key"]);
}

function normalizeHeaderValue(value: string | readonly string[] | undefined): string | undefined {
  if (typeof value !== "string") {
    return value ? normalizeHeaderValues(value) : undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeHeaderValues(values: readonly string[]): string | undefined {
  if (values.length !== 1) return undefined;
  const normalized = values[0]?.trim();
  return normalized || undefined;
}

function readRawHeaderValues(
  rawHeaders: readonly string[] | undefined,
  expectedName: string
): readonly string[] {
  if (!rawHeaders) return [];
  const values: string[] = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === expectedName) {
      values.push(rawHeaders[index + 1] ?? "");
    }
  }
  return values;
}

function isValidIdempotencyKey(value: string): boolean {
  return value.length >= 8 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}
