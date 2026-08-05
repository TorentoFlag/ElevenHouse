import { BadRequestException, Body, Controller, Get, Headers, Inject, Param, Post, Put, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { AdminTariffListResponse, AdminTariffResponse } from "@elevenhouse/contracts";

import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AdminSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { PlatformTariffsService } from "./platform-tariffs.service";

@Controller("admin/tariffs")
@UseGuards(AdminSessionAuthGuard)
export class PlatformTariffsController {
  constructor(@Inject(PlatformTariffsService) private readonly service: PlatformTariffsService) {}

  @Get()
  listTariffs(): Promise<AdminTariffListResponse> {
    return this.service.listTariffs();
  }

  @Post()
  @RequireCsrf()
  @RequireIdempotency()
  createDraft(
    @Req() request: AdminSessionRequest,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() body: unknown
  ): Promise<AdminTariffResponse> {
    return this.service.createDraft(requireAdminUserId(request), idempotencyKey, body);
  }

  @Put()
  @RequireCsrf()
  @RequireIdempotency()
  updateDraft(
    @Req() request: AdminSessionRequest,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() body: unknown
  ): Promise<AdminTariffResponse> {
    return this.service.updateDraft(requireAdminUserId(request), idempotencyKey, body);
  }

  @Post(":tariffSeriesId/:version/publish")
  @RequireCsrf()
  @RequireIdempotency()
  publishDraft(
    @Req() request: AdminSessionRequest,
    @Headers("idempotency-key") idempotencyKey: string,
    @Param("tariffSeriesId") tariffSeriesId: string,
    @Param("version") version: string,
    @Body() body: unknown
  ): Promise<AdminTariffResponse> {
    const numericVersion = Number(version);
    if (!Number.isSafeInteger(numericVersion) || numericVersion < 1) {
      throw new BadRequestException("Valid tariff version is required");
    }
    return this.service.publishDraft(
      requireAdminUserId(request),
      idempotencyKey,
      tariffSeriesId,
      numericVersion,
      body
    );
  }
}

function requireAdminUserId(request: AdminSessionRequest): string {
  const account = request.currentAdminAccount;
  if (!account) throw new UnauthorizedException("Valid admin session is required");
  return account.id;
}
