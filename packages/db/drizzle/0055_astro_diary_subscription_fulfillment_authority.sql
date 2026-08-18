insert into "finance_paid_product_fulfillment_decisions" (
  "supported",
  "registry_key",
  "registry_revision",
  "hold_anchor",
  "terminal_evidence_owner",
  "terminal_evidence_status",
  "terminal_evidence_contract_version",
  "cancellation_allocator_owner",
  "cancellation_allocator_port",
  "cancellation_allocator_policy_version"
) values (
  true,
  'sub.sub.async.solo',
  1,
  'booking_completed',
  'booking',
  'completed',
  1,
  'booking',
  'BookingCancellationRefundDecisionPort',
  1
) on conflict ("registry_key", "registry_revision") do nothing;--> statement-breakpoint
do $$
begin
  if not exists (
    select 1
      from "finance_paid_product_fulfillment_decisions"
     where "registry_key" = 'sub.sub.async.solo'
       and "registry_revision" = 1
       and "supported" = true
       and "hold_anchor" = 'booking_completed'
       and "terminal_evidence_owner" = 'booking'
       and "terminal_evidence_status" = 'completed'
       and "terminal_evidence_contract_version" = 1
       and "cancellation_allocator_owner" = 'booking'
       and "cancellation_allocator_port" = 'BookingCancellationRefundDecisionPort'
       and "cancellation_allocator_policy_version" = 1
  ) then
    raise exception 'AstroDiary subscription fulfillment authority is absent or conflicts'
      using errcode = '23514';
  end if;
end;
$$;
