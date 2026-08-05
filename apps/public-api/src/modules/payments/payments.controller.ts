import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  checkoutPreparationStateResponseSchema,
  type CheckoutPreparationResponse,
  type CheckoutPreparationStateResponse
} from "@elevenhouse/contracts";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { PublicSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import {
  ClientCheckoutActionService,
  ClientCheckoutActionServiceError
} from "./client-checkout-action.service";
import { PaymentsService } from "./payments.service";
import { PAYMENTS_CHECKOUT_ACTION_SERVICE } from "./payments.tokens";

@Controller("payments")
@UseGuards(PublicSessionAuthGuard)
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly paymentsService: PaymentsService,
    @Inject(PAYMENTS_CHECKOUT_ACTION_SERVICE)
    private readonly checkoutActionService: ClientCheckoutActionService | null
  ) {}

  @Post("checkout")
  @RequireCsrf()
  @RequireIdempotency({ scope: "payments.checkout" })
  createCheckout(
    @Req() request: PublicSessionRequest,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ): Promise<CheckoutPreparationResponse> {
    return this.paymentsService.createCheckout(
      requireClientUserId(request),
      body,
      requireIdempotencyKey(idempotencyKey)
    );
  }

  @Get("checkout-preparations/:checkoutPreparationId")
  async getCheckoutPreparationState(
    @Req() request: PublicSessionRequest,
    @Param("checkoutPreparationId") checkoutPreparationId: string
  ): Promise<CheckoutPreparationStateResponse> {
    if (!isUuid(checkoutPreparationId)) {
      throw new BadRequestException("Valid checkout preparation id is required");
    }
    if (!this.checkoutActionService) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: "payment_checkout_action_preparation_required",
        code: "payment_checkout_action_preparation_required",
        message: "Payment checkout is preparing through the secure payment service"
      });
    }
    try {
      return checkoutPreparationStateResponseSchema.parse({
        checkoutPreparationId,
        state: await this.checkoutActionService.resolveState({
          checkoutPreparationId,
          clientUserId: requireClientUserId(request)
        })
      });
    } catch (error) {
      if (error instanceof ClientCheckoutActionServiceError && error.reason === "checkout_not_found") {
        throw new NotFoundException({
          statusCode: 404,
          error: "payment_checkout_preparation_not_found",
          code: "payment_checkout_preparation_not_found",
          message: "Payment checkout preparation was not found"
        });
      }
      throw error;
    }
  }

  /**
   * Redirect delivery is deliberately a separate owner-scoped action. The HPP URL never
   * appears in a JSON resource and the response must not be cached by browsers or proxies.
   */
  @Get("checkout-preparations/:checkoutPreparationId/action")
  async resolveCheckoutAction(
    @Req() request: PublicSessionRequest,
    @Param("checkoutPreparationId") checkoutPreparationId: string,
    @Res() response: CheckoutActionResponse
  ): Promise<void> {
    if (!isUuid(checkoutPreparationId)) {
      throw new BadRequestException("Valid checkout preparation id is required");
    }
    if (!this.checkoutActionService) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: "payment_checkout_action_preparation_required",
        code: "payment_checkout_action_preparation_required",
        message: "Payment checkout is preparing through the secure payment service"
      });
    }

    try {
      const action = await this.checkoutActionService.resolveAction({
        checkoutPreparationId,
        clientUserId: requireClientUserId(request),
        requestId: randomUUID()
      });
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Referrer-Policy", "no-referrer");
      if (action.kind === "checkout_action_ready") {
        response.redirect(303, action.checkoutUrl);
        return;
      }
      if (action.kind === "checkout_preparing") {
        response.status(202).json({ state: "checkout_requested" });
        return;
      }
      if (action.kind === "provider_session_unknown") {
        response.status(409).json({ state: "provider_session_unknown" });
        return;
      }
      response.status(422).json({ state: "failed" });
    } catch (error) {
      if (error instanceof ClientCheckoutActionServiceError) {
        if (error.reason === "checkout_not_found") {
          throw new NotFoundException({
            statusCode: 404,
            error: "payment_checkout_preparation_not_found",
            code: "payment_checkout_preparation_not_found",
            message: "Payment checkout preparation was not found"
          });
        }
        throw new ServiceUnavailableException({
          statusCode: 503,
          error: "payment_checkout_action_unavailable",
          code: "payment_checkout_action_unavailable",
          message: "Payment checkout action is temporarily unavailable"
        });
      }
      throw error;
    }
  }
}

type CheckoutActionResponse = Readonly<{
  setHeader(name: string, value: string): void;
  redirect(statusCode: number, url: string): void;
  status(statusCode: number): Readonly<{ json(body: unknown): void }>;
}>;

function requireClientUserId(request: PublicSessionRequest): string {
  const account = request.currentCustomerAccount?.account;
  if (!account) throw new UnauthorizedException("Valid public session is required");
  if (!account.roles.includes("client")) throw new ForbiddenException("Client role is required");
  return account.id;
}

function requireIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new BadRequestException("Valid Idempotency-Key header is required");
  return normalized;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
