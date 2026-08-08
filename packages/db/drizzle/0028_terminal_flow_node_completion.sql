ALTER TABLE "flow_execution_tokens" DROP CONSTRAINT "flow_execution_tokens_completed_node_check";--> statement-breakpoint
ALTER TABLE "flow_execution_tokens" ADD CONSTRAINT "flow_execution_tokens_completed_node_check" CHECK (
  "flow_execution_tokens"."state" <> 'completed'
  OR "flow_execution_tokens"."node_kind" IN ('completed', 'suppressed', 'failed')
);
