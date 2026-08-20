INSERT INTO "finance_operation_resource_policy_versions" (
  "policy_id",
  "version",
  "operation_kind",
  "draft_revision",
  "lifecycle",
  "maximum_rows",
  "maximum_decimal_digits",
  "maximum_artifact_bytes",
  "canonical_preimage",
  "canonical_digest",
  "created_at",
  "published_at",
  "retired_at"
)
SELECT
  'default-client-order-capture',
  1,
  'client_order_capture',
  1,
  'published',
  100,
  38,
  65536,
  '{"maximumArtifactBytes":65536,"maximumDecimalDigits":38,"maximumRows":100,"operationKind":"client_order_capture","policyId":"default-client-order-capture","version":1}',
  'sha256:f7fe5811e818ebdf601482438da232be34a00017cf40cba1a1a09030fc6c655c',
  now(),
  now(),
  null
WHERE NOT EXISTS (
  SELECT 1
  FROM "finance_operation_resource_policy_versions"
  WHERE "operation_kind" = 'client_order_capture'
    AND "lifecycle" = 'published'
);
--> statement-breakpoint
DO $$
DECLARE
  policy_digest text;
BEGIN
  SELECT "canonical_digest"
    INTO policy_digest
    FROM "finance_operation_resource_policy_versions"
   WHERE "operation_kind" = 'client_order_capture'
     AND "lifecycle" = 'published';

  IF policy_digest IS DISTINCT FROM 'sha256:f7fe5811e818ebdf601482438da232be34a00017cf40cba1a1a09030fc6c655c' THEN
    RAISE EXCEPTION 'Published client_order_capture resource policy does not match canonical seed'
      USING ERRCODE = '23514',
            CONSTRAINT = 'finance_operation_resource_policy_versions_client_order_capture_seed';
  END IF;
END $$;
