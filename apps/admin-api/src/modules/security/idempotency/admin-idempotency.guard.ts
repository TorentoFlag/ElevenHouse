import { BadRequestException, Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { adminIdempotencyRequiredMetadataKey } from "../route-policy/route-security-policy";

type IdempotencyRequest = Readonly<{
  headers?: Record<string, string | readonly string[] | undefined>;
  headersDistinct?: Record<string, readonly string[] | undefined>;
  rawHeaders?: readonly string[];
}>;

@Injectable()
export class AdminIdempotencyGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.reflector.getAllAndOverride<boolean>(adminIdempotencyRequiredMetadataKey, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const key = readSingleIdempotencyKey(context.switchToHttp().getRequest<IdempotencyRequest>());
    if (!key || key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
      throw new BadRequestException("Valid Idempotency-Key header is required");
    }
    return true;
  }
}

function readSingleIdempotencyKey(request: IdempotencyRequest): string | undefined {
  const values = request.headersDistinct?.["idempotency-key"] ?? rawHeaderValues(request.rawHeaders, "idempotency-key");
  if (values.length > 0) return values.length === 1 ? normalize(values[0]) : undefined;
  const header = request.headers?.["idempotency-key"];
  if (typeof header === "string") return normalize(header);
  return header?.length === 1 ? normalize(header[0]) : undefined;
}

function rawHeaderValues(rawHeaders: readonly string[] | undefined, name: string): readonly string[] {
  if (!rawHeaders) return [];
  const values: string[] = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === name) values.push(rawHeaders[index + 1] ?? "");
  }
  return values;
}

function normalize(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
