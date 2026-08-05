import { BadRequestException, Body, Controller, Get, Headers, Inject, Param, Post, Put, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { AdminSavedCardDisclosureListResponse, AdminSavedCardDisclosureResponse } from "@elevenhouse/contracts";
import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AdminSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { SavedCardDisclosuresService } from "./saved-card-disclosures.service";

@Controller("admin/finance/saved-card-disclosures")
@UseGuards(AdminSessionAuthGuard)
export class SavedCardDisclosuresController {
  constructor(@Inject(SavedCardDisclosuresService) private readonly service: SavedCardDisclosuresService) {}
  @Get() list(): Promise<AdminSavedCardDisclosureListResponse> { return this.service.list(); }
  @Post() @RequireCsrf() @RequireIdempotency()
  create(@Req() request: AdminSessionRequest, @Headers("idempotency-key") key: string, @Body() body: unknown): Promise<AdminSavedCardDisclosureResponse> { return this.service.createDraft(actor(request), key, body); }
  @Put() @RequireCsrf() @RequireIdempotency()
  update(@Req() request: AdminSessionRequest, @Headers("idempotency-key") key: string, @Body() body: unknown): Promise<AdminSavedCardDisclosureResponse> { return this.service.updateDraft(actor(request), key, body); }
  @Post(":seriesId/:version/:locale/publish") @RequireCsrf() @RequireIdempotency()
  publish(@Req() request: AdminSessionRequest, @Headers("idempotency-key") key: string, @Param("seriesId") seriesId: string, @Param("version") value: string, @Param("locale") locale: string, @Body() body: unknown): Promise<AdminSavedCardDisclosureResponse> { return this.service.publish(actor(request), key, seriesId, version(value), language(locale), body); }
  @Post(":seriesId/:version/:locale/retire") @RequireCsrf() @RequireIdempotency()
  retire(@Req() request: AdminSessionRequest, @Headers("idempotency-key") key: string, @Param("seriesId") seriesId: string, @Param("version") value: string, @Param("locale") locale: string): Promise<AdminSavedCardDisclosureResponse> { return this.service.retire(actor(request), key, seriesId, version(value), language(locale)); }
}
function actor(request: AdminSessionRequest) { if (!request.currentAdminAccount) throw new UnauthorizedException("Valid admin session is required"); return request.currentAdminAccount.id; }
function version(value: string) { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1) throw new BadRequestException("Valid disclosure version is required"); return parsed; }
function language(value: string): "ru" | "en" { if (value === "ru" || value === "en") return value; throw new BadRequestException("Disclosure locale must be ru or en"); }
