import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { DictionaryAiService } from "./dictionary-ai.service";

@Controller("dictionary")
@UseGuards(AstrologerSessionAuthGuard)
export class DictionaryAiController {
  constructor(private readonly dictionaryAiService: DictionaryAiService) {}

  @Post("ai-draft")
  @RequireCsrf()
  createAiDraft(
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ): ReturnType<DictionaryAiService["createDraft"]> {
    return this.dictionaryAiService.createDraft(body, request);
  }
}
