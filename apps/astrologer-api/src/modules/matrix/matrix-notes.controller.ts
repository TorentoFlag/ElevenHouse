import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { MatrixNotesService } from "./matrix-notes.service";

@Controller("matrix")
@UseGuards(AstrologerSessionAuthGuard)
export class MatrixNotesController {
  constructor(private readonly notesService: MatrixNotesService) {}

  @Get("calculations/:calculationId/notes")
  list(
    @Param("calculationId") calculationId: string,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.notesService.list(calculationId, request);
  }

  @Post("calculations/:calculationId/notes")
  @RequireCsrf()
  create(
    @Param("calculationId") calculationId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.notesService.create(calculationId, body, request);
  }

  @Put("calculations/:calculationId/notes/:noteId")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  update(
    @Param("calculationId") calculationId: string,
    @Param("noteId") noteId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.notesService.update(calculationId, noteId, body, request);
  }

  @Delete("calculations/:calculationId/notes/:noteId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireCsrf()
  delete(
    @Param("calculationId") calculationId: string,
    @Param("noteId") noteId: string,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.notesService.delete(calculationId, noteId, request);
  }

  @Get("interpretations")
  interpretation(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.notesService.interpretation(query, request);
  }
}
