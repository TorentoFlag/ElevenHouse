import { timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MessagingService } from "./messaging.service";
import { parseTelegramBusinessWebhookUpdate } from "./telegram-business-webhook";

@Controller("messaging/webhooks")
export class MessagingWebhooksController {
  constructor(
    private readonly service: MessagingService,
    private readonly configService: ConfigService
  ) {}

  @Post("telegram/bot")
  async handleTelegramBotWebhook(
    @Body() body: unknown,
    @Headers("x-telegram-bot-api-secret-token") secretToken: string | undefined
  ) {
    this.assertTelegramSecret(secretToken);
    const update = parseTelegramBusinessWebhookUpdateSafely(body);
    await this.service.handleTelegramBusinessWebhookUpdate(update);
    return { ok: true };
  }

  private assertTelegramSecret(secretToken: string | undefined): void {
    const expected = this.configService.getOrThrow<string | null>(
      "astrologerApi.telegramBotWebhookSecret"
    );
    if (!expected || !secretToken || !constantTimeEquals(secretToken, expected)) {
      throw new UnauthorizedException("Valid Telegram webhook secret is required");
    }
  }
}

function parseTelegramBusinessWebhookUpdateSafely(body: unknown) {
  try {
    return parseTelegramBusinessWebhookUpdate(body);
  } catch (error) {
    if (error instanceof UnauthorizedException) throw error;
    throw new BadRequestException("Invalid Telegram webhook payload");
  }
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
