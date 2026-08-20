CREATE INDEX "bookings_owner_client_service_idx" ON "bookings" USING btree ("owner_user_id","client_user_id","service_start_at","id");
CREATE INDEX "sessions_owner_client_schedule_idx" ON "sessions" USING btree ("owner_user_id","client_user_id","scheduled_start_at","id");
