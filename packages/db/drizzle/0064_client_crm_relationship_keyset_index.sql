CREATE INDEX "client_astrologer_relationships_astrologer_status_last_linked_id_idx" ON "client_astrologer_relationships" USING btree ("astrologer_user_id","status","last_linked_at","id");
