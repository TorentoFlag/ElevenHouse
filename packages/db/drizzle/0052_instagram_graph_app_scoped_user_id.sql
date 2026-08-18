alter table "messaging_instagram_graph_accounts"
  add column "instagram_app_scoped_user_id" text;

alter table "messaging_instagram_graph_accounts"
  add constraint "messaging_instagram_graph_accounts_app_scoped_user_unique"
  unique ("instagram_app_scoped_user_id");

alter table "messaging_instagram_graph_accounts"
  add constraint "messaging_instagram_graph_accounts_app_scoped_user_id_length_check"
  check ("instagram_app_scoped_user_id" is null or length(trim("instagram_app_scoped_user_id")) between 1 and 200);
