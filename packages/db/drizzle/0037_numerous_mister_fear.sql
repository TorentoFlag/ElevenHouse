ALTER TABLE "flows" DROP CONSTRAINT "flows_status_check";--> statement-breakpoint
DROP INDEX "flows_owner_status_updated_idx";--> statement-breakpoint
ALTER TABLE "flows" DROP COLUMN "status";