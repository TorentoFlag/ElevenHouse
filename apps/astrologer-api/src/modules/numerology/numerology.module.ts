import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AiModule } from "../ai/ai.module";
import { ClockModule } from "../clock/clock.module";
import { AstrologerProfileModule } from "../astrologer-profile/astrologer-profile.module";
import { CalculationsModule } from "../calculations/calculations.module";
import { ClientsModule } from "../clients/clients.module";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { NumerologyController } from "./numerology.controller";
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
    SecurityModule
  ],
  controllers: [NumerologyController],
  providers: [NumerologyService]
})
export class NumerologyModule {}
