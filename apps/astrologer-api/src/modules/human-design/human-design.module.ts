import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AiModule } from "../ai/ai.module";
import { AstrologerProfileModule } from "../astrologer-profile/astrologer-profile.module";
import { CalculationsModule } from "../calculations/calculations.module";
import { ClockModule } from "../clock/clock.module";
import { ClientsModule } from "../clients/clients.module";
import { IdentityModule } from "../identity/identity.module";
import { PlatformEntitlementsModule } from "../platform-entitlements/platform-entitlements.module";
import { SecurityModule } from "../security/security.module";
import { HumanDesignController } from "./human-design.controller";
import { HumanDesignPdfController } from "./human-design-pdf.controller";
import { HumanDesignPdfService } from "./human-design-pdf.service";
import { createChartEngineHumanDesignResolvedInputProvider } from "./human-design-resolved-input.provider";
import { HumanDesignService } from "./human-design.service";
import { HUMAN_DESIGN_RESOLVED_INPUT_PROVIDER } from "./human-design.tokens";

@Module({
  imports: [
    AiModule,
    AstrologerProfileModule,
    ConfigModule,
    CalculationsModule,
    ClockModule,
    ClientsModule,
    IdentityModule,
    PlatformEntitlementsModule,
    SecurityModule
  ],
  controllers: [HumanDesignController, HumanDesignPdfController],
  providers: [
    HumanDesignService,
    HumanDesignPdfService,
    {
      provide: HUMAN_DESIGN_RESOLVED_INPUT_PROVIDER,
      useFactory: createChartEngineHumanDesignResolvedInputProvider,
      inject: [ConfigService]
    }
  ]
})
export class HumanDesignModule {}
