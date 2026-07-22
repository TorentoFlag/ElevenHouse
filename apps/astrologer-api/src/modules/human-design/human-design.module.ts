import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { HumanDesignController } from "./human-design.controller";
import { HumanDesignService } from "./human-design.service";

@Module({
  imports: [IdentityModule],
  controllers: [HumanDesignController],
  providers: [HumanDesignService]
})
export class HumanDesignModule {}
