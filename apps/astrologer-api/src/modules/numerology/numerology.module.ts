import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AiModule } from "../ai/ai.module";
import { ClockModule } from "../clock/clock.module";
import { AstrologerProfileModule } from "../astrologer-profile/astrologer-profile.module";
import { CalculationsModule } from "../calculations/calculations.module";
import { ClientsModule } from "../clients/clients.module";
import { IdentityModule } from "../identity/identity.module";
import { PlatformEntitlementsModule } from "../platform-entitlements/platform-entitlements.module";
import { SecurityModule } from "../security/security.module";
import { NumerologyController } from "./numerology.controller";
import { NumerologyPdfController } from "./numerology-pdf.controller";
import { NumerologyPdfService } from "./numerology-pdf.service";
import { NumerologyService } from "./numerology.service";

@Module({
  imports: [
    AiModule,
    CalculationsModule,
    AstrologerProfileModule,
    ClientsModule,
    ConfigModule,
    ClockModule,
    IdentityModule,
    PlatformEntitlementsModule,
    SecurityModule
  ],
  controllers: [NumerologyController, NumerologyPdfController],
  providers: [NumerologyService, NumerologyPdfService]
})
export class NumerologyModule {}
