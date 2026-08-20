CREATE TABLE "review_source_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "astrologer_user_id" uuid NOT NULL,
  "client_user_id" uuid NOT NULL,
  "relationship_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "source_resource_key" varchar(180) NOT NULL,
  "product_id" uuid,
  "order_id" uuid,
  "title_snapshot" text NOT NULL,
  "context_label_snapshot" text NOT NULL,
  "received_at" timestamp with time zone NOT NULL,
  "window_policy" text NOT NULL,
  "active_period_ends_at" timestamp with time zone,
  "status" text DEFAULT 'received' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "review_source_receipts"
  ADD CONSTRAINT "review_source_receipts_astrologer_user_id_users_id_fk"
  FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id")
  ON DELETE restrict ON UPDATE no action;

ALTER TABLE "review_source_receipts"
  ADD CONSTRAINT "review_source_receipts_client_user_id_users_id_fk"
  FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id")
  ON DELETE restrict ON UPDATE no action;

ALTER TABLE "review_source_receipts"
  ADD CONSTRAINT "review_source_receipts_product_id_products_id_fk"
  FOREIGN KEY ("product_id") REFERENCES "public"."products"("id")
  ON DELETE restrict ON UPDATE no action;

ALTER TABLE "review_source_receipts"
  ADD CONSTRAINT "review_source_receipts_order_id_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id")
  ON DELETE restrict ON UPDATE no action;

ALTER TABLE "review_source_receipts"
  ADD CONSTRAINT "review_source_receipts_relationship_fk"
  FOREIGN KEY ("relationship_id", "client_user_id", "astrologer_user_id")
  REFERENCES "public"."client_astrologer_relationships"("id", "client_user_id", "astrologer_user_id")
  ON DELETE restrict ON UPDATE no action;

CREATE UNIQUE INDEX "review_source_receipts_source_unique"
  ON "review_source_receipts" USING btree ("astrologer_user_id", "client_user_id", "kind", "source_resource_key");

CREATE INDEX "review_source_receipts_pending_idx"
  ON "review_source_receipts" USING btree ("status", "received_at", "astrologer_user_id");

CREATE INDEX "review_source_receipts_client_idx"
  ON "review_source_receipts" USING btree ("client_user_id", "received_at");

ALTER TABLE "review_source_receipts"
  ADD CONSTRAINT "review_source_receipts_kind_check"
  CHECK ("kind" in ('booking', 'astro_diary_period', 'astro_calendar_service_period', 'async_delivery', 'instant_delivery', 'mini_delivery', 'course_access', 'course_completion', 'pack_session', 'pack', 'subscription_period', 'group_participation', 'gift_redemption', 'custom_fulfillment'));

ALTER TABLE "review_source_receipts"
  ADD CONSTRAINT "review_source_receipts_window_policy_check"
  CHECK ("window_policy" in ('standard_14_days_after_receipt', 'active_period_plus_14_days'));

ALTER TABLE "review_source_receipts"
  ADD CONSTRAINT "review_source_receipts_status_check"
  CHECK ("status" in ('received', 'revoked'));

ALTER TABLE "review_source_receipts"
  ADD CONSTRAINT "review_source_receipts_title_check"
  CHECK (length(trim("title_snapshot")) between 1 and 240 and "title_snapshot" = trim("title_snapshot") and "title_snapshot" !~ '[[:cntrl:]]');

ALTER TABLE "review_source_receipts"
  ADD CONSTRAINT "review_source_receipts_context_label_check"
  CHECK (length(trim("context_label_snapshot")) between 1 and 240 and "context_label_snapshot" = trim("context_label_snapshot") and "context_label_snapshot" !~ '[[:cntrl:]]');

ALTER TABLE "review_source_receipts"
  ADD CONSTRAINT "review_source_receipts_source_resource_key_check"
  CHECK (length(trim("source_resource_key")) between 1 and 180 and "source_resource_key" = trim("source_resource_key"));

ALTER TABLE "review_source_receipts"
  ADD CONSTRAINT "review_source_receipts_active_period_check"
  CHECK (("window_policy" = 'active_period_plus_14_days' and "active_period_ends_at" is not null and "received_at" <= "active_period_ends_at") or ("window_policy" <> 'active_period_plus_14_days' and "active_period_ends_at" is null));
