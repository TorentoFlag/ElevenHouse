CREATE TABLE "client_crm_private_profiles" (
  "relationship_id" uuid PRIMARY KEY NOT NULL,
  "client_user_id" uuid NOT NULL,
  "astrologer_user_id" uuid NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "client_crm_private_profiles_relationship_pair_fk"
    FOREIGN KEY ("relationship_id","client_user_id","astrologer_user_id")
    REFERENCES "client_astrologer_relationships"("id","client_user_id","astrologer_user_id")
    ON DELETE cascade,
  CONSTRAINT "client_crm_private_profiles_note_length_check"
    CHECK ("note" IS NULL OR length("note") <= 2000)
);

CREATE INDEX "client_crm_private_profiles_astrologer_client_idx"
  ON "client_crm_private_profiles" USING btree ("astrologer_user_id","client_user_id");

CREATE TABLE "client_crm_private_tags" (
  "relationship_id" uuid NOT NULL,
  "tag" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "client_crm_private_tags_relationship_tag_pk"
    PRIMARY KEY ("relationship_id","tag"),
  CONSTRAINT "client_crm_private_tags_relationship_fk"
    FOREIGN KEY ("relationship_id")
    REFERENCES "client_crm_private_profiles"("relationship_id")
    ON DELETE cascade,
  CONSTRAINT "client_crm_private_tags_tag_length_check"
    CHECK (length(trim("tag")) BETWEEN 1 AND 64)
);

CREATE UNIQUE INDEX "client_crm_private_tags_relationship_lower_tag_unique"
  ON "client_crm_private_tags" USING btree ("relationship_id", lower("tag"));
