import { createHmac, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AstrologerApiRuntimeConfig } from "../../config/runtime-config";
import {
  parseInstagramGraphWebhookUpdates,
  type ParsedInstagramGraphWebhookUpdate
} from "./instagram-graph-webhook";
import { MessagingService } from "./messaging.service";
import { parseTelegramBusinessWebhookUpdate } from "./telegram-business-webhook";
import {
  parseWhatsAppCloudWebhookChanges,
  type ParsedWhatsAppCloudWebhookChange
} from "./whatsapp-cloud-webhook";

@Controller("messaging/webhooks")
export class MessagingWebhooksController {
  private readonly logger = new Logger(MessagingWebhooksController.name);

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

  @Get("instagram/graph")
  @Header("content-type", "text/plain")
  verifyInstagramGraphWebhook(
    @Query("hub.mode") mode: string | undefined,
    @Query("hub.verify_token") verifyToken: string | undefined,
    @Query("hub.challenge") challenge: string | undefined
  ): string {
    const config = this.getInstagramGraphConfig();
    if (
      mode !== "subscribe" ||
      !challenge ||
      !config.webhookVerifyToken ||
      !verifyToken ||
      !constantTimeEquals(verifyToken, config.webhookVerifyToken)
    ) {
      this.logger.warn(
        `Instagram Graph webhook verification rejected mode=${mode ?? "missing"} challenge=${
          challenge ? "present" : "missing"
        } token=${verifyToken ? "present" : "missing"}`
      );
      throw new UnauthorizedException("Valid Instagram webhook verification token is required");
    }

    this.logger.log("Instagram Graph webhook verification accepted");
    return challenge;
  }

  @Post("instagram/graph")
  @HttpCode(200)
  async handleInstagramGraphWebhook(
    @Body() body: unknown,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Req() request: { readonly rawBody?: Buffer }
  ) {
    const config = this.getInstagramGraphConfig();
    this.logger.log(
      `Instagram Graph webhook received rawBodyBytes=${request.rawBody?.length ?? 0} hasSignature=${
        signature ? "true" : "false"
      }`
    );
    try {
      assertInstagramGraphSignature({
        appSecret: config.appSecret,
        rawBody: request.rawBody,
        signature
      });
    } catch (error) {
      this.logger.warn("Instagram Graph webhook rejected: invalid signature");
      throw error;
    }
    const updates = parseInstagramGraphWebhookUpdatesSafely(body, this.logger);
    this.logger.log(`Instagram Graph webhook accepted ${summarizeInstagramGraphUpdates(updates)}`);
    await this.service.handleInstagramGraphWebhookUpdates(updates);
    return { ok: true };
  }

  @Get("whatsapp/cloud")
  @Header("content-type", "text/plain")
  verifyWhatsAppCloudWebhook(
    @Query("hub.mode") mode: string | undefined,
    @Query("hub.verify_token") verifyToken: string | undefined,
    @Query("hub.challenge") challenge: string | undefined
  ): string {
    const config = this.getWhatsAppCloudConfig();
    if (
      mode !== "subscribe" ||
      !challenge ||
      !verifyToken ||
      !constantTimeEquals(verifyToken, config.webhookVerifyToken)
    ) {
      this.logger.warn(
        `WhatsApp Cloud webhook verification rejected mode=${mode ?? "missing"} challenge=${
          challenge ? "present" : "missing"
        } token=${verifyToken ? "present" : "missing"}`
      );
      throw new UnauthorizedException("Valid WhatsApp webhook verification token is required");
    }

    this.logger.log("WhatsApp Cloud webhook verification accepted");
    return challenge;
  }

  @Post("whatsapp/cloud")
  @HttpCode(200)
  async handleWhatsAppCloudWebhook(
    @Body() body: unknown,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Req() request: { readonly rawBody?: Buffer }
  ) {
    const config = this.getWhatsAppCloudConfig();
    this.logger.log(
      `WhatsApp Cloud webhook received rawBodyBytes=${request.rawBody?.length ?? 0} hasSignature=${
        signature ? "true" : "false"
      }`
    );
    try {
      assertMetaWebhookSignature({
        providerName: "WhatsApp",
        appSecret: config.appSecret,
        rawBody: request.rawBody,
        signature
      });
    } catch (error) {
      this.logger.warn("WhatsApp Cloud webhook rejected: invalid signature");
      throw error;
    }
    const changes = parseWhatsAppCloudWebhookChangesSafely(body, this.logger);
    this.logger.log(`WhatsApp Cloud webhook accepted ${summarizeWhatsAppCloudChanges(changes)}`);
    await this.service.handleWhatsAppCloudWebhookChanges(changes);
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

  private getInstagramGraphConfig(): NonNullable<AstrologerApiRuntimeConfig["instagramGraph"]> {
    const config =
      this.configService.get<AstrologerApiRuntimeConfig["instagramGraph"]>(
        "astrologerApi.instagramGraph"
      ) ?? null;
    if (!config) {
      throw new UnauthorizedException("Valid Instagram webhook configuration is required");
    }
    return config;
  }

  private getWhatsAppCloudConfig(): NonNullable<AstrologerApiRuntimeConfig["whatsappCloud"]> {
    const config =
      this.configService.get<AstrologerApiRuntimeConfig["whatsappCloud"]>(
        "astrologerApi.whatsappCloud"
      ) ?? null;
    if (!config) {
      throw new UnauthorizedException("Valid WhatsApp webhook configuration is required");
    }
    return config;
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

function parseInstagramGraphWebhookUpdatesSafely(body: unknown, logger: Logger) {
  try {
    return parseInstagramGraphWebhookUpdates(body);
  } catch (error) {
    if (error instanceof UnauthorizedException) throw error;
    logger.warn(`Instagram Graph webhook rejected: invalid payload ${summarizeWebhookBody(body)}`);
    throw new BadRequestException("Invalid Instagram webhook payload");
  }
}

function parseWhatsAppCloudWebhookChangesSafely(body: unknown, logger: Logger) {
  try {
    return parseWhatsAppCloudWebhookChanges(body);
  } catch (error) {
    if (error instanceof UnauthorizedException) throw error;
    logger.warn(`WhatsApp Cloud webhook rejected: invalid payload ${summarizeWebhookBody(body)}`);
    throw new BadRequestException("Invalid WhatsApp webhook payload");
  }
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function summarizeInstagramGraphUpdates(
  updates: readonly ParsedInstagramGraphWebhookUpdate[]
): string {
  const accountIds = uniquePreview(updates.map((update) => update.instagramAccountId));
  const messageIds = uniquePreview(updates.map((update) => update.providerMessageId));
  return `updateCount=${updates.length} instagramAccountIds=${accountIds} providerMessageIds=${messageIds}`;
}

function summarizeWhatsAppCloudChanges(
  changes: readonly ParsedWhatsAppCloudWebhookChange[]
): string {
  const wabaIds = uniquePreview(changes.map((change) => change.wabaId));
  const phoneNumberIds = uniquePreview(
    changes.map((change) => change.phoneNumberId).filter((id): id is string => Boolean(id))
  );
  const fields = uniquePreview(changes.map((change) => change.field));
  return `changeCount=${changes.length} fields=${fields} wabaIds=${wabaIds} phoneNumberIds=${phoneNumberIds}`;
}

function uniquePreview(values: readonly string[]): string {
  const uniqueValues = Array.from(new Set(values)).slice(0, 5);
  return uniqueValues.length > 0 ? uniqueValues.join(",") : "none";
}

function summarizeWebhookBody(body: unknown): string {
  if (!body || typeof body !== "object") return "shape=non_object";
  const record = body as Record<string, unknown>;
  const entry = Array.isArray(record.entry) ? record.entry : [];
  const entrySummaries = entry.slice(0, 3).map((item) => {
    if (!item || typeof item !== "object") return "entry=non_object";
    const entryRecord = item as Record<string, unknown>;
    const changes = Array.isArray(entryRecord.changes) ? entryRecord.changes : [];
    const messaging = Array.isArray(entryRecord.messaging) ? entryRecord.messaging : [];
    const changeFields = changes
      .slice(0, 5)
      .map((change) =>
        change && typeof change === "object"
          ? String((change as Record<string, unknown>).field ?? "unknown")
          : "non_object"
      );
    return [
      `id=${typeof entryRecord.id === "string" || typeof entryRecord.id === "number" ? entryRecord.id : "missing"}`,
      `changes=${changes.length}`,
      `changeFields=${changeFields.length ? changeFields.join(",") : "none"}`,
      `messaging=${messaging.length}`
    ].join(" ");
  });
  return [
    `object=${typeof record.object === "string" ? record.object : "missing"}`,
    `field=${typeof record.field === "string" ? record.field : "missing"}`,
    `entryCount=${entry.length}`,
    `entries=${entrySummaries.length ? entrySummaries.join(" | ") : "none"}`
  ].join(" ");
}

function assertInstagramGraphSignature(input: {
  readonly appSecret: string;
  readonly rawBody: Buffer | undefined;
  readonly signature: string | undefined;
}): void {
  if (!input.rawBody || !input.signature?.startsWith("sha256=")) {
    throw new UnauthorizedException("Valid Instagram webhook signature is required");
  }
  const signatureHex = input.signature.slice("sha256=".length);
  if (!/^[a-f0-9]+$/i.test(signatureHex)) {
    throw new UnauthorizedException("Valid Instagram webhook signature is required");
  }
  const expectedHex = createHmac("sha256", input.appSecret).update(input.rawBody).digest("hex");
  const signatureBytes = Buffer.from(signatureHex, "hex");
  const expectedBytes = Buffer.from(expectedHex, "hex");
  if (
    signatureBytes.length !== expectedBytes.length ||
    !timingSafeEqual(signatureBytes, expectedBytes)
  ) {
    throw new UnauthorizedException("Valid Instagram webhook signature is required");
  }
}

function assertMetaWebhookSignature(input: {
  readonly providerName: "WhatsApp";
  readonly appSecret: string;
  readonly rawBody: Buffer | undefined;
  readonly signature: string | undefined;
}): void {
  if (!input.rawBody || !input.signature?.startsWith("sha256=")) {
    throw new UnauthorizedException(`Valid ${input.providerName} webhook signature is required`);
  }
  const signatureHex = input.signature.slice("sha256=".length);
  if (!/^[a-f0-9]+$/i.test(signatureHex)) {
    throw new UnauthorizedException(`Valid ${input.providerName} webhook signature is required`);
  }
  const expectedHex = createHmac("sha256", input.appSecret).update(input.rawBody).digest("hex");
  const signatureBytes = Buffer.from(signatureHex, "hex");
  const expectedBytes = Buffer.from(expectedHex, "hex");
  if (
    signatureBytes.length !== expectedBytes.length ||
    !timingSafeEqual(signatureBytes, expectedBytes)
  ) {
    throw new UnauthorizedException(`Valid ${input.providerName} webhook signature is required`);
  }
}
