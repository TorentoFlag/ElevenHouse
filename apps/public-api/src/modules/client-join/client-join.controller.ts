import { Body, Controller, Post } from "@nestjs/common";
import type {
  CreateClientJoinIntentRequest,
  CreateClientJoinIntentResponse
} from "@elevenhouse/contracts";
import { ClientJoinService } from "./client-join.service";

@Controller("client-join-intents")
export class ClientJoinController {
  constructor(private readonly clientJoinService: ClientJoinService) {}

  @Post()
  createJoinIntent(
    @Body() body: CreateClientJoinIntentRequest
  ): Promise<CreateClientJoinIntentResponse> {
    return this.clientJoinService.createJoinIntent(body);
  }
}
