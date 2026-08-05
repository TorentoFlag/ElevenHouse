import { Module } from "@nestjs/common";

import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { AdminFinanceAuthorizationsController } from "./finance-authorizations.controller";
import { AdminFinanceAuthorizationsService } from "./finance-authorizations.service";

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [AdminFinanceAuthorizationsController],
  providers: [AdminFinanceAuthorizationsService, SystemClock],
  exports: [AdminFinanceAuthorizationsService]
})
export class AdminFinanceAuthorizationsModule {}
