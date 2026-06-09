import { Injectable } from "@nestjs/common";
import { healthResponseSchema, type HealthResponse } from "@elevenhouse/contracts";

@Injectable()
export class HealthService {
  getHealth(now: Date = new Date()): HealthResponse {
    return healthResponseSchema.parse({
      service: "ops-api",
      status: "ok",
      timestamp: now.toISOString()
    });
  }
}
