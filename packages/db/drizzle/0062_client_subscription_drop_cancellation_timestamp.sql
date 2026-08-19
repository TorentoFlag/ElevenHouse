ALTER TABLE "client_subscriptions" DROP CONSTRAINT "client_subscriptions_state_pointer_shape_check";--> statement-breakpoint
ALTER TABLE "client_subscriptions" DROP COLUMN "cancellation_effective_at";--> statement-breakpoint
ALTER TABLE "client_subscriptions" ADD CONSTRAINT "client_subscriptions_state_pointer_shape_check" CHECK ((
        "client_subscriptions"."state" = 'pending_initial_payment'
        and "client_subscriptions"."current_period_id" is null
        and "client_subscriptions"."future_period_id" is null
      ) or (
        "client_subscriptions"."state" = 'active'
        and "client_subscriptions"."current_period_id" is not null
      ) or (
        "client_subscriptions"."state" = 'ended'
        and "client_subscriptions"."current_period_id" is null
        and "client_subscriptions"."future_period_id" is null
      ) or (
        "client_subscriptions"."state" = 'revoked'
        and "client_subscriptions"."current_period_id" is null
        and "client_subscriptions"."future_period_id" is null
      ));
