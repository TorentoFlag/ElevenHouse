import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ClockModule } from "../clock/clock.module";
import { CalculationsModule } from "../calculations/calculations.module";
import { ClientsModule } from "../clients/clients.module";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { NumerologyController } from "./numerology.controller";
import { NumerologyService } from "./numerology.service";

@Module({
  imports: [
    CalculationsModule,
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
