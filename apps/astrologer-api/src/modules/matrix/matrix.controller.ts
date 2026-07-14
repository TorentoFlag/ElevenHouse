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
import { MatrixService } from "./matrix.service";

@Controller("matrix")
@UseGuards(AstrologerSessionAuthGuard)
export class MatrixController {
  constructor(private readonly matrixService: MatrixService) {}

  @Post("preview")
  @HttpCode(HttpStatus.OK)
  preview(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.matrixService.preview(body, request);
  }

  @Post("calculations")
  @RequireCsrf()
  createCalculation(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.matrixService.createCalculation(body, request);
  }

  @Post("calculations/:calculationId/recalculate")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  recalculate(
    @Param("calculationId") calculationId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.matrixService.recalculate(calculationId, body, request);
  }

  @Get("calculations/:calculationId/projection")
  projection(
    @Param("calculationId") calculationId: string,
    @Query() query: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.matrixService.projection(calculationId, query, request);
  }
}
