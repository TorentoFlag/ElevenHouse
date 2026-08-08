import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Put,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type {
  AdminFlowRuntimeControlResponse,
  ReplaceAdminFlowRuntimeControlResponse
} from "@elevenhouse/contracts";
import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AdminSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { FlowRuntimeControlService } from "./flow-runtime-control.service";

@Controller("admin/flows/runtime-control")
@UseGuards(AdminSessionAuthGuard)
export class FlowRuntimeControlController {
  constructor(@Inject(FlowRuntimeControlService) private readonly service: FlowRuntimeControlService) {}

  @Get()
  readCurrent(): Promise<AdminFlowRuntimeControlResponse> {
    return this.service.readCurrent();
  }

  @Put()
  @RequireCsrf()
  @RequireIdempotency()
  replace(
    @Req() request: AdminSessionRequest,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() body: unknown
  ): Promise<ReplaceAdminFlowRuntimeControlResponse> {
    return this.service.replace(requireSuperAdminUserId(request), idempotencyKey, body);
  }
}

function requireSuperAdminUserId(request: AdminSessionRequest): string {
  const account = request.currentAdminAccount;
  if (!account) throw new UnauthorizedException("Valid admin session is required");
  if (!account.roles.includes("super_admin")) {
    throw new ForbiddenException("Super-admin Flow runtime authorization is required");
  }
  return account.id;
}
