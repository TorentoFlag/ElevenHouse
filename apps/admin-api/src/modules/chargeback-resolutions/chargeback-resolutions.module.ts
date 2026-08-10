import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AdminFinanceAuthorizationsModule } from "../finance-authorizations/finance-authorizations.module";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { SystemClock } from "../../common/system-clock.js";
import { AdminChargebackResolutionsController } from "./chargeback-resolutions.controller";
import { AdminChargebackResolutionsService } from "./chargeback-resolutions.service";
@Module({ imports: [DatabaseModule, IdentityModule, SecurityModule, AdminFinanceAuthorizationsModule], controllers: [AdminChargebackResolutionsController], providers: [AdminChargebackResolutionsService, SystemClock] })
export class AdminChargebackResolutionsModule {}
