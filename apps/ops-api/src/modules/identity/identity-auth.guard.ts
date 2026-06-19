import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext
} from "@nestjs/common";
import {
  IdentityCurrentSessionService,
  type OpsSessionRequest
} from "./identity-current-session.service";

@Injectable()
export class OpsSessionAuthGuard implements CanActivate {
  constructor(private readonly currentSessionService: IdentityCurrentSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OpsSessionRequest>();
    const currentAstrologerAccount =
      await this.currentSessionService.resolveCurrentAstrologerAccount(request);

    if (!currentAstrologerAccount) {
      throw new UnauthorizedException("Valid ops session is required");
    }

    request.currentAstrologerAccount = currentAstrologerAccount;

    return true;
  }
}
