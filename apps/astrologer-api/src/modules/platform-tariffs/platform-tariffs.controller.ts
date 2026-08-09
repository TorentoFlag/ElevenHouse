import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import type {
  AstrologerTariffCatalogResponse,
  AstrologerTariffEntitlementsResponse,
  InitiateSavedCardSetupResponse,
  ExecuteSavedCardSetupResponse,
  CompleteSavedCardSetupThreeDsMethodResponse,
  SavedCardSetupDisclosureResponse,
  SavedCardSetupStatusResponse,
  TariffInvoicePaymentStatusResponse,
  CompleteTariffInvoiceThreeDsMethodResponse,
  StartAstrologerTariffSubscriptionResponse
} from "@elevenhouse/contracts";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { AstrologerTariffsService } from "./platform-tariffs.service";
import { TariffInvoicePaymentStatusService } from "./tariff-invoice-payment-status.service";
import { TariffInvoiceThreeDsMethodService } from "./tariff-invoice-three-ds-method.service";

@Controller("tariffs")
@UseGuards(AstrologerSessionAuthGuard)
export class AstrologerTariffsController {
  constructor(
    @Inject(AstrologerTariffsService) private readonly service: AstrologerTariffsService,
    @Inject(TariffInvoicePaymentStatusService)
    private readonly invoicePaymentStatus: TariffInvoicePaymentStatusService,
    @Inject(TariffInvoiceThreeDsMethodService)
    private readonly invoiceThreeDsMethod: TariffInvoiceThreeDsMethodService
  ) {}

  @Get()
  getCatalog(@Req() request: AstrologerSessionRequest): Promise<AstrologerTariffCatalogResponse> {
    return this.service.getCatalog(request);
  }

  @Get("entitlements")
  @Header("Cache-Control", "no-store")
  @Header("ETag", '""')
  getEntitlements(
    @Req() request: AstrologerSessionRequest
  ): Promise<AstrologerTariffEntitlementsResponse> {
    return this.service.getEntitlements(request);
  }

  @Post("subscriptions")
  @RequireCsrf()
  @RequireIdempotency({ scope: "astrologer.tariff_subscription.select" })
  startSubscription(
    @Req() request: AstrologerSessionRequest,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() body: unknown
  ): Promise<StartAstrologerTariffSubscriptionResponse> {
    return this.service.startSubscription(request, idempotencyKey, body);
  }

  @Get("subscriptions/:subscriptionId/saved-card-disclosure")
  getSavedCardDisclosure(
    @Req() request: AstrologerSessionRequest,
    @Param("subscriptionId") subscriptionId: string,
    @Query("locale") locale: unknown
  ): Promise<SavedCardSetupDisclosureResponse> {
    return this.service.getSavedCardDisclosure(request, subscriptionId, locale);
  }

  @Post("subscriptions/:subscriptionId/saved-card-setup")
  @RequireCsrf()
  @RequireIdempotency({ scope: "astrologer.tariff_subscription.saved_card_setup" })
  initiateSavedCardSetup(
    @Req() request: AstrologerSessionRequest,
    @Param("subscriptionId") subscriptionId: string,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() body: unknown
  ): Promise<InitiateSavedCardSetupResponse> {
    return this.service.initiateSavedCardSetup(request, subscriptionId, idempotencyKey, body);
  }

  @Get("subscriptions/:subscriptionId/saved-card-setup")
  getCurrentSavedCardSetupStatus(
    @Req() request: AstrologerSessionRequest,
    @Param("subscriptionId") subscriptionId: string
  ): Promise<SavedCardSetupStatusResponse | null> {
    return this.service.getCurrentSavedCardSetupStatus(request, subscriptionId);
  }

  @Post("saved-card-setups/:setupSessionId/execute")
  @RequireCsrf()
  @RequireIdempotency({ scope: "astrologer.tariff_subscription.saved_card_setup.execute" })
  executeSavedCardSetup(
    @Req() request: AstrologerSessionRequest,
    @Param("setupSessionId") setupSessionId: string,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() body: unknown
  ): Promise<ExecuteSavedCardSetupResponse> {
    return this.service.executeSavedCardSetup(request, setupSessionId, idempotencyKey, body);
  }

  @Post("saved-card-setups/:setupSessionId/complete-3ds-method")
  @RequireCsrf()
  @RequireIdempotency({ scope: "astrologer.tariff_subscription.saved_card_setup.complete_3ds_method" })
  completeSavedCardSetupThreeDsMethod(
    @Req() request: AstrologerSessionRequest,
    @Param("setupSessionId") setupSessionId: string,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() body: unknown
  ): Promise<CompleteSavedCardSetupThreeDsMethodResponse> {
    return this.service.completeSavedCardSetupThreeDsMethod(request, setupSessionId, idempotencyKey, body);
  }

  @Get("saved-card-setups/:setupSessionId")
  getSavedCardSetupStatus(
    @Req() request: AstrologerSessionRequest,
    @Param("setupSessionId") setupSessionId: string
  ): Promise<SavedCardSetupStatusResponse> {
    return this.service.getSavedCardSetupStatus(request, setupSessionId);
  }

  @Get("invoices/:invoiceId/payment-status")
  getTariffInvoicePaymentStatus(
    @Req() request: AstrologerSessionRequest,
    @Param("invoiceId") invoiceId: string
  ): Promise<TariffInvoicePaymentStatusResponse> {
    return this.invoicePaymentStatus.getStatus(request, invoiceId);
  }

  @Get("subscriptions/:subscriptionId/payment-status")
  getCurrentTariffInvoicePaymentStatus(
    @Req() request: AstrologerSessionRequest,
    @Param("subscriptionId") subscriptionId: string
  ): Promise<TariffInvoicePaymentStatusResponse | null> {
    return this.invoicePaymentStatus.getCurrentStatus(request, subscriptionId);
  }

  @Post("invoices/:invoiceId/complete-3ds-method")
  @RequireCsrf()
  @RequireIdempotency({ scope: "astrologer.tariff_invoice.complete_3ds_method" })
  completeTariffInvoiceThreeDsMethod(
    @Req() request: AstrologerSessionRequest,
    @Param("invoiceId") invoiceId: string,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() body: unknown
  ): Promise<CompleteTariffInvoiceThreeDsMethodResponse> {
    return this.invoiceThreeDsMethod.complete(request, invoiceId, idempotencyKey, body);
  }
}
