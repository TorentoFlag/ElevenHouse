import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext
} from "@nestjs/common";
import {
  IdentityCurrentSessionService,
  type AstrologerSessionRequest
} from "../session/identity-current-session.service";

@Injectable()
export class AstrologerSessionAuthGuard implements CanActivate {
  constructor(private readonly currentSessionService: IdentityCurrentSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AstrologerSessionRequest>();
    const currentAstrologerAccount =
      await this.currentSessionService.resolveCurrentAstrologerAccount(request);

    if (!currentAstrologerAccount) {
      throw new UnauthorizedException("Valid astrologer session is required");
    }

    request.currentAstrologerAccount = currentAstrologerAccount;

    return true;
  }
}
