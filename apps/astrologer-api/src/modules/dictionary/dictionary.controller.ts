import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { DictionaryService } from "./dictionary.service";

@Controller("dictionary")
@UseGuards(AstrologerSessionAuthGuard)
export class DictionaryController {
  constructor(private readonly dictionaryService: DictionaryService) {}

  @Get("categories")
  listCategories(
    @Query() query: unknown,
    @Req() request: AstrologerSessionRequest
  ): ReturnType<DictionaryService["listCategories"]> {
    return this.dictionaryService.listCategories(query, request);
  }

  @Get("entries")
  listEntries(
    @Query() query: unknown,
    @Req() request: AstrologerSessionRequest
  ): ReturnType<DictionaryService["listEntries"]> {
    return this.dictionaryService.listEntries(query, request);
  }

  @Post("custom-entries")
  @RequireCsrf()
  createCustomEntry(
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ): ReturnType<DictionaryService["createCustomEntry"]> {
    return this.dictionaryService.createCustomEntry(body, request);
  }

  @Put("platform-entries/:platformEntryId/override")
  @RequireCsrf()
  overridePlatformEntry(
    @Param("platformEntryId") platformEntryId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ): ReturnType<DictionaryService["overridePlatformEntry"]> {
    return this.dictionaryService.overridePlatformEntry(platformEntryId, body, request);
  }

  @Delete("entries/:entryId")
  @HttpCode(204)
  @RequireCsrf()
  deleteEntry(
    @Param("entryId") entryId: string,
    @Req() request: AstrologerSessionRequest
  ): ReturnType<DictionaryService["deleteEntry"]> {
    return this.dictionaryService.deleteEntry(entryId, request);
  }

  @Delete("entries")
  @HttpCode(204)
  @RequireCsrf()
  resetEntries(@Req() request: AstrologerSessionRequest): ReturnType<DictionaryService["resetEntries"]> {
    return this.dictionaryService.resetEntries(request);
  }

  @Delete("platform-entries/:platformEntryId/override")
  @HttpCode(204)
  @RequireCsrf()
  resetPlatformEntryOverride(
    @Param("platformEntryId") platformEntryId: string,
    @Req() request: AstrologerSessionRequest
  ): ReturnType<DictionaryService["resetPlatformEntryOverride"]> {
    return this.dictionaryService.resetPlatformEntryOverride(platformEntryId, request);
  }
}
