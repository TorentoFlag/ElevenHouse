import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { MessagingService } from "./messaging.service";

@Controller("messaging/channel-connections/instagram/graph")
export class InstagramGraphComplianceController {
  constructor(private readonly service: MessagingService) {}

  @Post("deauthorize")
  @HttpCode(200)
  deauthorize(@Body() body: unknown) {
    return this.service.handleInstagramGraphDeauthorizeCallback(body);
  }

  @Post("data-deletion")
  @HttpCode(200)
  dataDeletion(@Body() body: unknown) {
    return this.service.handleInstagramGraphDataDeletionCallback(body);
  }

  @Get("data-deletion/status/:confirmationCode")
  dataDeletionStatus(@Param("confirmationCode") confirmationCode: string) {
    return this.service.getInstagramGraphDataDeletionStatus(confirmationCode);
  }
}
