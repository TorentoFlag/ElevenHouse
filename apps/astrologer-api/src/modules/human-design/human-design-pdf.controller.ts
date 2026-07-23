import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { HumanDesignPdfService } from "./human-design-pdf.service";

@Controller("human-design")
@UseGuards(AstrologerSessionAuthGuard)
export class HumanDesignPdfController {
  constructor(private readonly pdfService: HumanDesignPdfService) {}

  @Get("calculations/:calculationId/report/pdf")
  latest(
    @Param("calculationId") calculationId: string,
    @Query() query: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.pdfService.latest(calculationId, query, request);
  }

  @Post("calculations/:calculationId/report/pdf")
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireCsrf()
  enqueue(
    @Param("calculationId") calculationId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.pdfService.enqueue(calculationId, body, request);
  }

  @Get("calculations/:calculationId/report/pdf/:jobId/download")
  download(
    @Param("calculationId") calculationId: string,
    @Param("jobId") jobId: string,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.pdfService.download(calculationId, jobId, request);
  }
}
