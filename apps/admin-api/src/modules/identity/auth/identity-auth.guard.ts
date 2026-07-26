import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext
} from "@nestjs/common";
import { isInternalPlatformRole } from "@elevenhouse/auth";
import {
  IdentityCurrentSessionService,
  type AdminSessionRequest
} from "../session/identity-current-session.service";

@Injectable()
export class AdminSessionAuthGuard implements CanActivate {
  constructor(
    @Inject(IdentityCurrentSessionService)
    private readonly currentSessionService: IdentityCurrentSessionService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminSessionRequest>();
    const currentAdminAccount =
      await this.currentSessionService.resolveCurrentAdminAccount(request);

    if (!currentAdminAccount) {
      throw new UnauthorizedException("Valid admin session is required");
    }
    if (!currentAdminAccount.roles.some(isInternalPlatformRole)) {
      throw new ForbiddenException("Internal platform role is required");
    }

    request.currentAdminAccount = currentAdminAccount;
    return true;
  }
}
