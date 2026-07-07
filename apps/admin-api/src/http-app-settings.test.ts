import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { configureAdminApiHttpSettings, type AdminApiHttpApp } from "./http-app-settings";

describe("configureAdminApiHttpSettings", () => {
  it("sets trust proxy and enables credentialed CORS for configured admin origins", () => {
    const app: AdminApiHttpApp = {
      set: vi.fn(),
      enableCors: vi.fn()
    };
    const configService = {
      getOrThrow: vi.fn((key: string) => {
        if (key === "adminApi.trustProxy") {
          return true;
        }

        if (key === "adminApi.allowedOrigins") {
          return ["https://admin.elevenhouse.com"];
        }

        throw new Error(`Unexpected config key: ${key}`);
      })
    } as unknown as ConfigService;

    configureAdminApiHttpSettings(app, configService);

    expect(app.set).toHaveBeenCalledWith("trust proxy", true);
    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ["https://admin.elevenhouse.com"],
      credentials: true
    });
  });
});
