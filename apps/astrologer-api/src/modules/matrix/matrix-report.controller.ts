import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards
} from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { MatrixReportService } from "./matrix-report.service";

@Controller("matrix")
@UseGuards(AstrologerSessionAuthGuard)
export class MatrixReportController {
  constructor(private readonly reportService: MatrixReportService) {}

  @Get("calculations/:calculationId/report")
  get(@Param("calculationId") calculationId: string, @Req() request: AstrologerSessionRequest) {
    return this.reportService.get(calculationId, request);
  }

  @Put("calculations/:calculationId/report")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  save(
    @Param("calculationId") calculationId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.reportService.save(calculationId, body, request);
  }

  @Post("calculations/:calculationId/report/ai-draft")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  generateAiDraft(
    @Param("calculationId") calculationId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.reportService.generateAiDraft(calculationId, body, request);
  }
}
