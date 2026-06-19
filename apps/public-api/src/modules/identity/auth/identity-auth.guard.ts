import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext
} from "@nestjs/common";
import {
  IdentityCurrentSessionService,
  type PublicSessionRequest
} from "../session/identity-current-session.service";

@Injectable()
export class PublicSessionAuthGuard implements CanActivate {
  constructor(private readonly currentSessionService: IdentityCurrentSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PublicSessionRequest>();
    const currentCustomerAccount =
      await this.currentSessionService.resolveCurrentCustomerAccount(request);

    if (!currentCustomerAccount) {
      throw new UnauthorizedException("Valid public session is required");
    }

    request.currentCustomerAccount = currentCustomerAccount;

    return true;
  }
}
