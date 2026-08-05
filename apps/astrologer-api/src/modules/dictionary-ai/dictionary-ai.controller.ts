import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { PlatformTariffCapabilityGuard } from "../platform-entitlements/platform-tariff-capability.guard";
import { RequirePlatformTariffCapabilities } from "../platform-entitlements/platform-tariff-capability.policy";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { DictionaryAiService } from "./dictionary-ai.service";

@Controller("dictionary")
@UseGuards(AstrologerSessionAuthGuard, PlatformTariffCapabilityGuard)
export class DictionaryAiController {
  constructor(private readonly dictionaryAiService: DictionaryAiService) {}

  @Post("ai-draft")
  @RequirePlatformTariffCapabilities({
    surfaceId: "ai.refs.draft",
    capabilities: ["ai", "refs"],
    operation: "generation"
  })
  @RequireCsrf()
  createAiDraft(
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ): ReturnType<DictionaryAiService["createDraft"]> {
    return this.dictionaryAiService.createDraft(body, request);
  }
}
