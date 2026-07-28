import { Controller, Get, Query, Res } from "@nestjs/common";
import { MessagingService } from "./messaging.service";

type RedirectResponse = {
  readonly redirect: (statusCode: number, url: string) => void;
};

@Controller("messaging/channel-connections/instagram/graph/callback")
export class InstagramGraphOAuthController {
  constructor(private readonly service: MessagingService) {}

  @Get()
  async callback(@Query() query: unknown, @Res() response: RedirectResponse) {
    const result = await this.service.completeInstagramGraphConnectionCallback(query);
    response.redirect(303, result.redirectUrl);
  }
}
