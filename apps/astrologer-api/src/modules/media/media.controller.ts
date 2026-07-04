import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { MediaService } from "./media.service";

@Controller("media")
@UseGuards(AstrologerSessionAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post("upload-intents")
  @RequireCsrf()
  createUploadIntent(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.mediaService.createUploadIntent(body, request);
  }

  @Post(":mediaId/complete")
  @RequireCsrf()
  completeUpload(
    @Param("mediaId") mediaId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.mediaService.completeUpload(mediaId, body, request);
  }
}
