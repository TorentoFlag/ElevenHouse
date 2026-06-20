import { Controller, Get, Inject } from "@nestjs/common";
import type { HealthResponse } from "@elevenhouse/contracts";
import { HealthService } from "./health.service";

@Controller()
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get("health")
  getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }
}
