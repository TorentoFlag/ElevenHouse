import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { configureAstrologerApiHttpSettings, type AstrologerApiHttpApp } from "./http-app-settings";

describe("configureAstrologerApiHttpSettings", () => {
  it("sets trust proxy and enables credentialed CORS for configured origins", () => {
    const app: AstrologerApiHttpApp = {
      set: vi.fn(),
      enableCors: vi.fn()
    };
    const configService = {
      getOrThrow: vi.fn((key: string) => {
        if (key === "astrologerApi.trustProxy") {
          return true;
        }

        if (key === "astrologerApi.allowedOrigins") {
          return ["http://localhost:5174"];
        }

        throw new Error(`Unexpected config key: ${key}`);
      })
    } as unknown as ConfigService;

    configureAstrologerApiHttpSettings(app, configService);

    expect(app.set).toHaveBeenCalledWith("trust proxy", true);
    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ["http://localhost:5174"],
      credentials: true
    });
  });
});
