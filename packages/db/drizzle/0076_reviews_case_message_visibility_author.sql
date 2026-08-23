ALTER TABLE "review_moderation_case_messages"
  DROP CONSTRAINT IF EXISTS "review_moderation_case_messages_visibility_author_check";

ALTER TABLE "review_moderation_case_messages"
  ADD CONSTRAINT "review_moderation_case_messages_visibility_author_check"
  CHECK (
    ("author_role" = 'moderator')
    OR ("author_role" = 'client' AND "visibility" = 'client_and_moderators')
    OR ("author_role" = 'astrologer' AND "visibility" = 'astrologer_and_moderators')
    OR ("author_role" = 'system' AND "visibility" IN ('all_case_participants', 'moderators_only'))
  );
