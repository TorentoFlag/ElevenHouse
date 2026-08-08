ALTER TABLE "finance_online_wallet_commitments" DROP CONSTRAINT "finance_online_wallet_commitments_previous_fk";--> statement-breakpoint
CREATE OR REPLACE FUNCTION finance_validate_online_wallet_commitment_predecessor()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.wallet_revision = 1 THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM finance_online_wallet_commitments capture_commitment
    WHERE capture_commitment.id = NEW.previous_commitment_id
      AND capture_commitment.wallet_id = NEW.wallet_id
      AND capture_commitment.wallet_revision = NEW.wallet_revision - 1
      AND capture_commitment.commitment_digest = NEW.previous_commitment_digest
  ) OR EXISTS (
    SELECT 1
    FROM finance_online_wallet_mutations mutation
    WHERE mutation.mutation_id = NEW.previous_commitment_id
      AND mutation.wallet_id = NEW.wallet_id
      AND mutation.next_wallet_revision = NEW.wallet_revision - 1
      AND mutation.commitment_digest = NEW.previous_commitment_digest
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'online wallet commitment predecessor is not the exact prior wallet state'
    USING errcode = '23514';
END;
$$;--> statement-breakpoint
CREATE TRIGGER finance_online_wallet_commitments_predecessor_guard
BEFORE INSERT ON finance_online_wallet_commitments
FOR EACH ROW EXECUTE FUNCTION finance_validate_online_wallet_commitment_predecessor();
