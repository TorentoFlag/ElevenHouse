import { Module } from "@nestjs/common";
import { createDrizzleAuditLogStore } from "@elevenhouse/db/audit-log";
import { createDrizzleSavedCardDisclosureAuthorityStore, executeIdempotentFinanceCommand, type FinanceTransaction } from "@elevenhouse/db/finance";
import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { SavedCardDisclosuresController } from "./saved-card-disclosures.controller";
import { SavedCardDisclosuresService } from "./saved-card-disclosures.service";
import { ADMIN_SAVED_CARD_DISCLOSURE_CLOCK, ADMIN_SAVED_CARD_DISCLOSURE_UNIT_OF_WORK } from "./saved-card-disclosures.tokens";
import type { AdminSavedCardDisclosureUnitOfWork } from "./saved-card-disclosures.unit-of-work";
@Module({ imports: [DatabaseModule, IdentityModule, SecurityModule], controllers: [SavedCardDisclosuresController], providers: [SavedCardDisclosuresService, { provide: ADMIN_SAVED_CARD_DISCLOSURE_CLOCK, useExisting: SystemClock }, { provide: ADMIN_SAVED_CARD_DISCLOSURE_UNIT_OF_WORK, useFactory: (runtime: PostgresRuntimeService): AdminSavedCardDisclosureUnitOfWork => ({ execute: (operation) => runtime.database.transaction((transaction) => operation(context(transaction))), executeIdempotent: (input) => executeIdempotentFinanceCommand({ database: runtime.database, command: input.command, create: (transaction) => input.create(context(transaction)), replay: (result) => runtime.database.transaction((transaction) => input.replay(context(transaction), result)) }) }), inject: [PostgresRuntimeService] }] })
export class SavedCardDisclosuresModule {}
function context(transaction: FinanceTransaction) { return { store: createDrizzleSavedCardDisclosureAuthorityStore(transaction), auditLogStore: createDrizzleAuditLogStore(transaction) }; }
