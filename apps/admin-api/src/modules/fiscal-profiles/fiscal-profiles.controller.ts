import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type {
  AdminFiscalProfileListResponse,
  AdminFiscalProfileResponse
} from "@elevenhouse/contracts";

import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AdminSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { FiscalProfilesService } from "./fiscal-profiles.service";

@Controller("admin/finance/fiscal-profiles")
@UseGuards(AdminSessionAuthGuard)
export class FiscalProfilesController {
  constructor(@Inject(FiscalProfilesService) private readonly service: FiscalProfilesService) {}

  @Get()
  listProfiles(): Promise<AdminFiscalProfileListResponse> {
    return this.service.listProfiles();
  }

  @Post()
  @RequireCsrf()
  @RequireIdempotency()
  createDraft(
    @Req() request: AdminSessionRequest,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() body: unknown
  ): Promise<AdminFiscalProfileResponse> {
    return this.service.createDraft(requireAdminUserId(request), idempotencyKey, body);
  }

  @Put()
  @RequireCsrf()
  @RequireIdempotency()
  updateDraft(
    @Req() request: AdminSessionRequest,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() body: unknown
  ): Promise<AdminFiscalProfileResponse> {
    return this.service.updateDraft(requireAdminUserId(request), idempotencyKey, body);
  }

  @Post(":profileSeriesId/:version/publish")
  @RequireCsrf()
  @RequireIdempotency()
  publishDraft(
    @Req() request: AdminSessionRequest,
    @Headers("idempotency-key") idempotencyKey: string,
    @Param("profileSeriesId") profileSeriesId: string,
    @Param("version") version: string,
    @Body() body: unknown
  ): Promise<AdminFiscalProfileResponse> {
    return this.service.publishDraft(
      requireAdminUserId(request), idempotencyKey, profileSeriesId, parseVersion(version), body
    );
  }

  @Post(":profileSeriesId/:version/retire")
  @RequireCsrf()
  @RequireIdempotency()
  retirePublished(
    @Req() request: AdminSessionRequest,
    @Headers("idempotency-key") idempotencyKey: string,
    @Param("profileSeriesId") profileSeriesId: string,
    @Param("version") version: string
  ): Promise<AdminFiscalProfileResponse> {
    return this.service.retirePublished(
      requireAdminUserId(request), idempotencyKey, profileSeriesId, parseVersion(version)
    );
  }
}

function parseVersion(value: string): number {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) throw new BadRequestException("Valid profile version is required");
  return version;
}

function requireAdminUserId(request: AdminSessionRequest): string {
  const account = request.currentAdminAccount;
  if (!account) throw new UnauthorizedException("Valid admin session is required");
  return account.id;
}
