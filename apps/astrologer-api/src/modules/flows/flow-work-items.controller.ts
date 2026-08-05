import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
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
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { FlowWorkItemsService } from "./flow-work-items.service";

@Controller("flow-work-items")
@UseGuards(AstrologerSessionAuthGuard)
export class FlowWorkItemsController {
  constructor(private readonly service: FlowWorkItemsService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  list(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.list(query, request);
  }

  @Post(":workItemId/start")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  @RequireIdempotency({ scope: "flows.work-items.start.v1" })
  start(
    @Param("workItemId") workItemId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.start(workItemId, body, idempotencyKey, request);
  }

  @Post(":workItemId/snooze")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  @RequireIdempotency({ scope: "flows.work-items.snooze.v1" })
  snooze(
    @Param("workItemId") workItemId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.snooze(workItemId, body, idempotencyKey, request);
  }

  @Post(":workItemId/complete")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  @RequireIdempotency({ scope: "flows.work-items.complete.v1" })
  complete(
    @Param("workItemId") workItemId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.complete(workItemId, body, idempotencyKey, request);
  }
}
