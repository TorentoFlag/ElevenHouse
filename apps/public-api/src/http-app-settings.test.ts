import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { configurePublicApiHttpSettings, type PublicApiHttpApp } from "./http-app-settings";

describe("configurePublicApiHttpSettings", () => {
  it("sets trust proxy and enables credentialed CORS for configured origins", () => {
    const app: PublicApiHttpApp = {
      set: vi.fn(),
      enableCors: vi.fn()
    };
    const configService = {
      getOrThrow: vi.fn((key: string) => {
        if (key === "publicApi.trustProxy") {
          return true;
        }

        if (key === "publicApi.allowedOrigins") {
          return ["http://localhost:5173"];
        }

        throw new Error(`Unexpected config key: ${key}`);
      })
    } as unknown as ConfigService;

    configurePublicApiHttpSettings(app, configService);

    expect(app.set).toHaveBeenCalledWith("trust proxy", true);
    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ["http://localhost:5173"],
      credentials: true
    });
  });
});
