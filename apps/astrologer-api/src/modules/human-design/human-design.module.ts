import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule } from "../clients/clients.module";
import { IdentityModule } from "../identity/identity.module";
import { HumanDesignController } from "./human-design.controller";
import { createChartEngineHumanDesignResolvedInputProvider } from "./human-design-resolved-input.provider";
import { HumanDesignService } from "./human-design.service";
import { HUMAN_DESIGN_RESOLVED_INPUT_PROVIDER } from "./human-design.tokens";

@Module({
  imports: [ConfigModule, ClientsModule, IdentityModule],
  controllers: [HumanDesignController],
  providers: [
    HumanDesignService,
    {
      provide: HUMAN_DESIGN_RESOLVED_INPUT_PROVIDER,
      useFactory: createChartEngineHumanDesignResolvedInputProvider,
      inject: [ConfigService]
    }
  ]
})
export class HumanDesignModule {}
