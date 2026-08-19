update "product_templates"
   set "status" = 'archived',
       "updated_at" = now()
 where "code" = 'astro_diary_subscription'
   and "status" = 'active';--> statement-breakpoint
do $$
begin
  if exists (
    select 1
      from "product_templates"
     where "code" = 'astro_diary_subscription'
       and "status" = 'active'
  ) then
    raise exception 'Legacy AstroDiary subscription product template is still active'
      using errcode = '23514';
  end if;
end;
$$;
