import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  idempotencyRequiredMetadataKey,
  type IdempotencyRequirement
} from "../route-policy/route-security-metadata";

type IdempotencyRequest = {
  readonly headers?: Record<string, string | readonly string[] | undefined>;
};

@Injectable()
export class IdempotencyGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<IdempotencyRequirement>(
      idempotencyRequiredMetadataKey,
      [context.getHandler(), context.getClass()]
    );

    if (!requirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest<IdempotencyRequest>();
    const idempotencyKey = normalizeHeaderValue(request.headers?.["idempotency-key"]);

    if (!idempotencyKey || !isValidIdempotencyKey(idempotencyKey)) {
      throw new BadRequestException("Valid Idempotency-Key header is required");
    }

    return true;
  }
}

function normalizeHeaderValue(value: string | readonly string[] | undefined): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : value?.[0]?.trim();

  return normalized ? normalized : undefined;
}

function isValidIdempotencyKey(value: string): boolean {
  return value.length >= 8 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}
