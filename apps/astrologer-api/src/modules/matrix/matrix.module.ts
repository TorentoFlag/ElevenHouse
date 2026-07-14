import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AstrologerProfileModule } from "../astrologer-profile/astrologer-profile.module";
import { ClockModule } from "../clock/clock.module";
import { CalculationsModule } from "../calculations/calculations.module";
import { ClientsModule } from "../clients/clients.module";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { MatrixController } from "./matrix.controller";
import { MatrixService } from "./matrix.service";

@Module({
  imports: [
    CalculationsModule,
    AstrologerProfileModule,
    ClientsModule,
    ConfigModule,
    ClockModule,
    IdentityModule,
    SecurityModule
  ],
  controllers: [MatrixController],
  providers: [MatrixService]
})
export class MatrixModule {}
