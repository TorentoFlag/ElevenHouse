ALTER TABLE "review_rating_aggregates" ADD COLUMN "star_1_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "review_rating_aggregates" ADD COLUMN "star_2_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "review_rating_aggregates" ADD COLUMN "star_3_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "review_rating_aggregates" ADD COLUMN "star_4_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "review_rating_aggregates" ADD COLUMN "star_5_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "review_rating_aggregates" ADD CONSTRAINT "review_rating_aggregates_star_counts_check" CHECK ("review_rating_aggregates"."star_1_count" >= 0 and "review_rating_aggregates"."star_2_count" >= 0 and "review_rating_aggregates"."star_3_count" >= 0 and "review_rating_aggregates"."star_4_count" >= 0 and "review_rating_aggregates"."star_5_count" >= 0 and "review_rating_aggregates"."star_1_count" + "review_rating_aggregates"."star_2_count" + "review_rating_aggregates"."star_3_count" + "review_rating_aggregates"."star_4_count" + "review_rating_aggregates"."star_5_count" = "review_rating_aggregates"."visible_review_count" and "review_rating_aggregates"."rating_sum" = "review_rating_aggregates"."star_1_count" + "review_rating_aggregates"."star_2_count" * 2 + "review_rating_aggregates"."star_3_count" * 3 + "review_rating_aggregates"."star_4_count" * 4 + "review_rating_aggregates"."star_5_count" * 5);
