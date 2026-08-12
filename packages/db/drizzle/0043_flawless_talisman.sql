ALTER TABLE "astro_diary_command_preconditions" DROP CONSTRAINT "astro_diary_command_preconditions_version_check";--> statement-breakpoint
ALTER TABLE "astro_diary_command_preconditions" ALTER COLUMN "expected_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "astro_diary_command_preconditions" ADD CONSTRAINT "astro_diary_command_preconditions_version_check" CHECK ((
        ("astro_diary_command_preconditions"."aggregate" = 'read_cursor' and "astro_diary_command_preconditions"."expected_version" is null)
        or "astro_diary_command_preconditions"."expected_version" >= 1
      ));