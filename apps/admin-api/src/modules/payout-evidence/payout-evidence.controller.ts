import type { IncomingMessage } from "node:http";
import {
  BadRequestException,
  Controller,
  Headers,
  Inject,
  PayloadTooLargeException,
  Post,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type { PayoutBankEvidenceUploadResponse } from "@elevenhouse/contracts";

import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AdminSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { PayoutEvidenceService, PayoutEvidenceUploadInputError } from "./payout-evidence.service";

@Controller("admin/finance/payout-evidence")
@UseGuards(AdminSessionAuthGuard)
export class PayoutEvidenceController {
  constructor(@Inject(PayoutEvidenceService) private readonly service: PayoutEvidenceService) {}

  @Post()
  @RequireCsrf()
  @RequireIdempotency()
  async upload(
    @Req() request: AdminSessionRequest & IncomingMessage,
    @Headers("idempotency-key") idempotencyKey: string,
    @Headers("content-type") contentType: string | undefined
  ): Promise<PayoutBankEvidenceUploadResponse> {
    try {
      const bytes = await readBoundedBody(request, this.service.maximumFileBytes);
      return await this.service.ingest({
        adminUserId: requireAdminUserId(request),
        idempotencyKey,
        contentType,
        bytes
      });
    } catch (error) {
      if (error instanceof PayoutEvidenceUploadInputError) {
        if (error.code === "payout_evidence_payload_too_large") {
          throw new PayloadTooLargeException(error.code);
        }
        throw new BadRequestException(error.code);
      }
      throw error;
    }
  }
}

async function readBoundedBody(request: IncomingMessage, maximumFileBytes: number): Promise<Uint8Array> {
  const contentLength = readContentLength(request);
  if (contentLength === null || contentLength < 1) {
    request.resume();
    throw new PayoutEvidenceUploadInputError("payout_evidence_content_length_invalid");
  }
  if (contentLength > maximumFileBytes) {
    request.resume();
    throw new PayoutEvidenceUploadInputError("payout_evidence_payload_too_large");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    total += bytes.length;
    if (total > maximumFileBytes) {
      request.resume();
      throw new PayoutEvidenceUploadInputError("payout_evidence_payload_too_large");
    }
    chunks.push(bytes);
  }
  if (total !== contentLength) {
    throw new PayoutEvidenceUploadInputError("payout_evidence_content_length_invalid");
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function readContentLength(request: IncomingMessage): number | null {
  const values = request.headersDistinct?.["content-length"];
  if (!values || values.length !== 1 || !/^[1-9][0-9]*$/.test(values[0] ?? "")) return null;
  const value = Number(values[0]);
  return Number.isSafeInteger(value) ? value : null;
}

function requireAdminUserId(request: AdminSessionRequest): string {
  const account = request.currentAdminAccount;
  if (!account) throw new UnauthorizedException("Valid admin session is required");
  return account.id;
}
