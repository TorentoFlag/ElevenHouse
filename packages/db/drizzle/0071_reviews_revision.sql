ALTER TABLE "reviews" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_revision_check" CHECK ("reviews"."revision" >= 1);
