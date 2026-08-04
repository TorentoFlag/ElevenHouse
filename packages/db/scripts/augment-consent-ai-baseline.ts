import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const statementBreakpoint = "--> statement-breakpoint";
const markerStart = "-- ElevenHouse consent and AI evidence integrity objects: begin";
const markerEnd = "-- ElevenHouse consent and AI evidence integrity objects: end";

const ownedObjectSignatures = [
  'CREATE TRIGGER "client_data_consents_immutable_evidence"',
  'CREATE TRIGGER "ai_usage_records_one_way_lifecycle"',
  'CREATE TRIGGER "ai_usage_consent_records_immutable_evidence"'
] as const;

export const consentAiIntegritySql = `CREATE OR REPLACE FUNCTION elevenhouse_guard_client_data_consent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $client_data_consent_guard$
BEGIN
  IF ROW(
      OLD.id,
      OLD.relationship_id,
      OLD.client_user_id,
      OLD.astrologer_user_id,
      OLD.purpose,
      OLD.policy_version,
      OLD.processor_code,
      OLD.notice_locale,
      OLD.notice_sha256,
      OLD.granted_at
    ) IS DISTINCT FROM ROW(
      NEW.id,
      NEW.relationship_id,
      NEW.client_user_id,
      NEW.astrologer_user_id,
      NEW.purpose,
      NEW.policy_version,
      NEW.processor_code,
      NEW.notice_locale,
      NEW.notice_sha256,
      NEW.granted_at
    )
    OR OLD.revoked_at IS NOT NULL
    OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'client consent evidence is immutable except for its first revocation'
      USING ERRCODE = '55000', CONSTRAINT = 'client_data_consents_immutable_evidence';
  END IF;

  RETURN NEW;
END;
$client_data_consent_guard$;
${statementBreakpoint}
CREATE TRIGGER "client_data_consents_immutable_evidence"
BEFORE UPDATE ON client_data_consents
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_client_data_consent_mutation();
${statementBreakpoint}
CREATE OR REPLACE FUNCTION elevenhouse_guard_ai_usage_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $ai_usage_record_guard$
BEGIN
  IF ROW(
      OLD.id,
      OLD.feature,
      OLD.prompt_id,
      OLD.prompt_version,
      OLD.provider,
      OLD.owner_safety_id,
      OLD.processing_authority_version,
      OLD.resource_type,
      OLD.resource_id,
      OLD.source_checksum,
      OLD.started_at
    ) IS DISTINCT FROM ROW(
      NEW.id,
      NEW.feature,
      NEW.prompt_id,
      NEW.prompt_version,
      NEW.provider,
      NEW.owner_safety_id,
      NEW.processing_authority_version,
      NEW.resource_type,
      NEW.resource_id,
      NEW.source_checksum,
      NEW.started_at
    )
    OR OLD.status <> 'started'
    OR NEW.status NOT IN ('succeeded', 'failed', 'indeterminate') THEN
    RAISE EXCEPTION 'AI usage evidence permits one started-to-terminal transition'
      USING ERRCODE = '55000', CONSTRAINT = 'ai_usage_records_one_way_lifecycle';
  END IF;

  RETURN NEW;
END;
$ai_usage_record_guard$;
${statementBreakpoint}
CREATE TRIGGER "ai_usage_records_one_way_lifecycle"
BEFORE UPDATE ON ai_usage_records
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_ai_usage_record_mutation();
${statementBreakpoint}
CREATE OR REPLACE FUNCTION elevenhouse_guard_ai_usage_consent_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $ai_usage_consent_record_guard$
DECLARE
  usage_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO usage_status
      FROM ai_usage_records
     WHERE id = NEW.usage_record_id;
    IF usage_status IS DISTINCT FROM 'started' THEN
      RAISE EXCEPTION 'AI usage consent evidence can only be attached before provider execution'
        USING ERRCODE = '55000', CONSTRAINT = 'ai_usage_consent_records_immutable_evidence';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'AI usage consent evidence is immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'ai_usage_consent_records_immutable_evidence';
  END IF;

  IF EXISTS (SELECT 1 FROM ai_usage_records WHERE id = OLD.usage_record_id) THEN
    RAISE EXCEPTION 'AI usage consent evidence can only be deleted with its usage record'
      USING ERRCODE = '55000', CONSTRAINT = 'ai_usage_consent_records_immutable_evidence';
  END IF;

  RETURN OLD;
END;
$ai_usage_consent_record_guard$;
${statementBreakpoint}
CREATE TRIGGER "ai_usage_consent_records_immutable_evidence"
BEFORE INSERT OR UPDATE OR DELETE ON ai_usage_consent_records
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_ai_usage_consent_record_mutation();`;

export const consentAiIndeterminateUpgradeSql = `
  LOCK TABLE ai_usage_records IN ACCESS EXCLUSIVE MODE;
  ALTER TABLE ai_usage_records
    DROP CONSTRAINT ai_usage_records_status_check,
    DROP CONSTRAINT ai_usage_records_safe_fields_check,
    DROP CONSTRAINT ai_usage_records_lifecycle_check;
  ALTER TABLE ai_usage_records
    ADD CONSTRAINT ai_usage_records_status_check
      CHECK (status IN ('started', 'succeeded', 'failed', 'indeterminate')),
    ADD CONSTRAINT ai_usage_records_safe_fields_check
      CHECK (
        length(trim(feature)) BETWEEN 1 AND 160
        AND length(trim(prompt_id)) BETWEEN 1 AND 160
        AND prompt_version >= 1
        AND length(trim(provider)) BETWEEN 1 AND 80
        AND (model IS NULL OR length(trim(model)) BETWEEN 1 AND 160)
        AND (finish_reason IS NULL OR length(trim(finish_reason)) BETWEEN 1 AND 120)
        AND (safe_error_code IS NULL OR safe_error_code IN (
          'AI_PROVIDER_REFUSED',
          'AI_PROVIDER_BAD_REQUEST',
          'AI_PROVIDER_RESPONSE_INVALID',
          'AI_PROVIDER_INCOMPLETE_RESPONSE',
          'AI_PROVIDER_UNAVAILABLE',
          'AI_PROVIDER_AUTHENTICATION_FAILED',
          'AI_PROVIDER_BILLING_FAILED',
          'AI_PROVIDER_RATE_LIMITED',
          'AI_PROVIDER_SERVER_ERROR',
          'AI_PROVIDER_TIMEOUT',
          'AI_PROVIDER_UNKNOWN_FAILURE',
          'AI_USAGE_OUTCOME_INDETERMINATE'
        ))
      ),
    ADD CONSTRAINT ai_usage_records_lifecycle_check
      CHECK (
        (
          status = 'started'
          AND model IS NULL
          AND finish_reason IS NULL
          AND safe_error_code IS NULL
          AND prompt_tokens IS NULL
          AND completion_tokens IS NULL
          AND total_tokens IS NULL
          AND duration_ms IS NULL
          AND completed_at IS NULL
        ) OR (
          status = 'succeeded'
          AND model IS NOT NULL
          AND finish_reason IS NOT NULL
          AND safe_error_code IS NULL
          AND duration_ms >= 0
          AND completed_at >= started_at
        ) OR (
          status = 'failed'
          AND model IS NULL
          AND finish_reason IS NULL
          AND safe_error_code IS NOT NULL
          AND prompt_tokens IS NULL
          AND completion_tokens IS NULL
          AND total_tokens IS NULL
          AND duration_ms >= 0
          AND completed_at >= started_at
        ) OR (
          status = 'indeterminate'
          AND model IS NULL
          AND finish_reason IS NULL
          AND safe_error_code = 'AI_USAGE_OUTCOME_INDETERMINATE'
          AND prompt_tokens IS NULL
          AND completion_tokens IS NULL
          AND total_tokens IS NULL
          AND duration_ms >= 0
          AND completed_at >= started_at
        )
      );
  CREATE OR REPLACE FUNCTION elevenhouse_guard_ai_usage_record_mutation()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $ai_usage_record_guard$
  BEGIN
    IF ROW(
        OLD.id,
        OLD.feature,
        OLD.prompt_id,
        OLD.prompt_version,
        OLD.provider,
        OLD.owner_safety_id,
        OLD.processing_authority_version,
        OLD.resource_type,
        OLD.resource_id,
        OLD.source_checksum,
        OLD.started_at
      ) IS DISTINCT FROM ROW(
        NEW.id,
        NEW.feature,
        NEW.prompt_id,
        NEW.prompt_version,
        NEW.provider,
        NEW.owner_safety_id,
        NEW.processing_authority_version,
        NEW.resource_type,
        NEW.resource_id,
        NEW.source_checksum,
        NEW.started_at
      )
      OR OLD.status <> 'started'
      OR NEW.status NOT IN ('succeeded', 'failed', 'indeterminate') THEN
      RAISE EXCEPTION 'AI usage evidence permits one started-to-terminal transition'
        USING ERRCODE = '55000', CONSTRAINT = 'ai_usage_records_one_way_lifecycle';
    END IF;

    RETURN NEW;
  END;
  $ai_usage_record_guard$;
`;

const previousConsentAiIntegritySql = consentAiIntegritySql.replace(
  "'succeeded', 'failed', 'indeterminate'",
  "'succeeded', 'failed'"
);

export const consentAiPersistenceBaselineDdl = `
  CREATE TABLE client_data_consents (
    id uuid PRIMARY KEY NOT NULL,
    relationship_id uuid NOT NULL,
    client_user_id uuid NOT NULL,
    astrologer_user_id uuid NOT NULL,
    purpose text NOT NULL,
    policy_version text NOT NULL,
    processor_code text NOT NULL,
    notice_locale text NOT NULL,
    notice_sha256 text NOT NULL,
    granted_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CONSTRAINT client_data_consents_relationship_identity_fk
      FOREIGN KEY (relationship_id, client_user_id, astrologer_user_id)
      REFERENCES client_astrologer_relationships(id, client_user_id, astrologer_user_id)
      ON DELETE RESTRICT,
    CONSTRAINT client_data_consents_purpose_check
      CHECK (length(trim(purpose)) BETWEEN 1 AND 160),
    CONSTRAINT client_data_consents_policy_version_check
      CHECK (length(trim(policy_version)) BETWEEN 1 AND 160),
    CONSTRAINT client_data_consents_processor_code_check
      CHECK (length(trim(processor_code)) BETWEEN 1 AND 80),
    CONSTRAINT client_data_consents_notice_locale_check
      CHECK (notice_locale IN ('ru', 'en')),
    CONSTRAINT client_data_consents_notice_sha256_check
      CHECK (notice_sha256 ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT client_data_consents_revocation_time_check
      CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
  );
  CREATE UNIQUE INDEX client_data_consents_one_current_unique
    ON client_data_consents (relationship_id, purpose)
    WHERE revoked_at IS NULL;
  CREATE INDEX client_data_consents_client_relationship_index
    ON client_data_consents (client_user_id, relationship_id, granted_at);
  CREATE INDEX client_data_consents_astrologer_client_index
    ON client_data_consents (astrologer_user_id, client_user_id, granted_at);

  CREATE TABLE ai_usage_records (
    id uuid PRIMARY KEY NOT NULL,
    status text NOT NULL,
    feature text NOT NULL,
    prompt_id text NOT NULL,
    prompt_version integer NOT NULL,
    provider text NOT NULL,
    owner_safety_id text NOT NULL,
    processing_authority_version text,
    resource_type text,
    resource_id uuid,
    source_checksum text,
    model text,
    finish_reason text,
    safe_error_code text,
    prompt_tokens integer,
    completion_tokens integer,
    total_tokens integer,
    duration_ms integer,
    started_at timestamptz NOT NULL,
    completed_at timestamptz,
    CONSTRAINT ai_usage_records_status_check
      CHECK (status IN ('started', 'succeeded', 'failed', 'indeterminate')),
    CONSTRAINT ai_usage_records_safe_fields_check
      CHECK (
        length(trim(feature)) BETWEEN 1 AND 160
        AND length(trim(prompt_id)) BETWEEN 1 AND 160
        AND prompt_version >= 1
        AND length(trim(provider)) BETWEEN 1 AND 80
        AND (model IS NULL OR length(trim(model)) BETWEEN 1 AND 160)
        AND (finish_reason IS NULL OR length(trim(finish_reason)) BETWEEN 1 AND 120)
        AND (safe_error_code IS NULL OR safe_error_code IN (
          'AI_PROVIDER_REFUSED',
          'AI_PROVIDER_BAD_REQUEST',
          'AI_PROVIDER_RESPONSE_INVALID',
          'AI_PROVIDER_INCOMPLETE_RESPONSE',
          'AI_PROVIDER_UNAVAILABLE',
          'AI_PROVIDER_AUTHENTICATION_FAILED',
          'AI_PROVIDER_BILLING_FAILED',
          'AI_PROVIDER_RATE_LIMITED',
          'AI_PROVIDER_SERVER_ERROR',
          'AI_PROVIDER_TIMEOUT',
          'AI_PROVIDER_UNKNOWN_FAILURE',
          'AI_USAGE_OUTCOME_INDETERMINATE'
        ))
      ),
    CONSTRAINT ai_usage_records_owner_safety_id_check
      CHECK (owner_safety_id ~ '^eh_[0-9a-f]{61}$'),
    CONSTRAINT ai_usage_records_resource_evidence_check
      CHECK (
        (processing_authority_version IS NULL OR length(trim(processing_authority_version)) BETWEEN 1 AND 160)
        AND (
          (resource_type IS NULL AND resource_id IS NULL AND source_checksum IS NULL)
          OR (
            processing_authority_version IS NOT NULL
            AND length(trim(resource_type)) BETWEEN 1 AND 80
            AND resource_id IS NOT NULL
            AND source_checksum ~ '^sha256:[0-9a-f]{64}$'
          )
        )
      ),
    CONSTRAINT ai_usage_records_token_counts_check
      CHECK (
        (prompt_tokens IS NULL AND completion_tokens IS NULL AND total_tokens IS NULL)
        OR (
          prompt_tokens >= 0
          AND completion_tokens >= 0
          AND total_tokens = prompt_tokens + completion_tokens
        )
      ),
    CONSTRAINT ai_usage_records_lifecycle_check
      CHECK (
        (
          status = 'started'
          AND model IS NULL
          AND finish_reason IS NULL
          AND safe_error_code IS NULL
          AND prompt_tokens IS NULL
          AND completion_tokens IS NULL
          AND total_tokens IS NULL
          AND duration_ms IS NULL
          AND completed_at IS NULL
        ) OR (
          status = 'succeeded'
          AND model IS NOT NULL
          AND finish_reason IS NOT NULL
          AND safe_error_code IS NULL
          AND duration_ms >= 0
          AND completed_at >= started_at
        ) OR (
          status = 'failed'
          AND model IS NULL
          AND finish_reason IS NULL
          AND safe_error_code IS NOT NULL
          AND prompt_tokens IS NULL
          AND completion_tokens IS NULL
          AND total_tokens IS NULL
          AND duration_ms >= 0
          AND completed_at >= started_at
        ) OR (
          status = 'indeterminate'
          AND model IS NULL
          AND finish_reason IS NULL
          AND safe_error_code = 'AI_USAGE_OUTCOME_INDETERMINATE'
          AND prompt_tokens IS NULL
          AND completion_tokens IS NULL
          AND total_tokens IS NULL
          AND duration_ms >= 0
          AND completed_at >= started_at
        )
      )
  );
  CREATE INDEX ai_usage_records_owner_started_index
    ON ai_usage_records (owner_safety_id, started_at);
  CREATE INDEX ai_usage_records_status_started_index
    ON ai_usage_records (status, started_at);
  CREATE INDEX ai_usage_records_feature_started_index
    ON ai_usage_records (feature, started_at);

  CREATE TABLE ai_usage_consent_records (
    usage_record_id uuid NOT NULL,
    consent_record_id uuid NOT NULL,
    CONSTRAINT ai_usage_consent_records_pk
      PRIMARY KEY (usage_record_id, consent_record_id),
    CONSTRAINT ai_usage_consent_records_usage_record_id_ai_usage_records_id_fk
      FOREIGN KEY (usage_record_id) REFERENCES ai_usage_records(id) ON DELETE CASCADE,
    CONSTRAINT ai_usage_consent_records_consent_record_id_client_data_consents_id_fk
      FOREIGN KEY (consent_record_id) REFERENCES client_data_consents(id) ON DELETE RESTRICT
  );
  CREATE INDEX ai_usage_consent_records_consent_index
    ON ai_usage_consent_records (consent_record_id);

  ${consentAiIntegritySql}
`;

export async function augmentConsentAiBaseline(migrationPath: string): Promise<void> {
  const source = await readFile(migrationPath, "utf8");
  assertCanonicalShape(source);

  const markerCount = countOccurrences(source, markerStart);
  const endMarkerCount = countOccurrences(source, markerEnd);
  const expectedBlock = canonicalIntegrityBlock();
  if (markerCount > 0 || endMarkerCount > 0) {
    if (
      markerCount === 1 &&
      endMarkerCount === 1 &&
      source.includes(expectedBlock) &&
      ownedObjectSignatures.every((signature) => countOccurrences(source, signature) === 1)
    ) {
      return;
    }
    const previousBlock = `${markerStart}\n${previousConsentAiIntegritySql}\n${markerEnd}`;
    if (
      markerCount !== 1 ||
      endMarkerCount !== 1 ||
      !source.includes(previousBlock) ||
      ownedObjectSignatures.some((signature) => countOccurrences(source, signature) !== 1)
    ) {
      throw new Error("Cannot augment baseline: partial or divergent consent/AI integrity objects");
    }
    await writeFile(migrationPath, source.replace(previousBlock, expectedBlock), "utf8");
    return;
  }

  if (ownedObjectSignatures.some((signature) => source.includes(signature))) {
    throw new Error("Cannot augment baseline: partial or divergent consent/AI integrity objects");
  }

  const augmented = `${source.trimEnd()}\n${statementBreakpoint}\n${expectedBlock}\n`;
  await writeFile(migrationPath, augmented, "utf8");
}

function canonicalIntegrityBlock(): string {
  return `${markerStart}\n${consentAiIndeterminateUpgradeSql}\n${consentAiIntegritySql}\n${markerEnd}`;
}

function assertCanonicalShape(source: string): void {
  const requiredFragments = [
    'CREATE TABLE "client_data_consents"',
    'CREATE TABLE "ai_usage_records"',
    'CREATE TABLE "ai_usage_consent_records"',
    '"revoked_at" timestamp with time zone',
    'CONSTRAINT "client_data_consents_revocation_time_check"',
    'CONSTRAINT "ai_usage_records_lifecycle_check"',
    'FOREIGN KEY ("relationship_id","client_user_id","astrologer_user_id")',
    'REFERENCES "public"."client_astrologer_relationships"("id","client_user_id","astrologer_user_id") ON DELETE restrict',
    'FOREIGN KEY ("usage_record_id") REFERENCES "public"."ai_usage_records"("id") ON DELETE cascade',
    'FOREIGN KEY ("consent_record_id") REFERENCES "public"."client_data_consents"("id") ON DELETE restrict'
  ];
  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      const reason = fragment.includes('FOREIGN KEY ("relationship_id"')
        ? "canonical consent relationship identity"
        : `required generated shape (${fragment})`;
      throw new Error(`Cannot augment baseline: missing ${reason}`);
    }
  }
}

function countOccurrences(source: string, fragment: string): number {
  return source.split(fragment).length - 1;
}

async function findCurrentBaseline(): Promise<string> {
  const migrationDirectory = join(__dirname, "../drizzle");
  const baselines = (await readdir(migrationDirectory))
    .filter((entry) => /^0000_.+\.sql$/.test(entry))
    .sort();
  if (baselines.length !== 1) {
    throw new Error(`Expected exactly one generated 0000 baseline, found ${baselines.length}`);
  }
  return join(migrationDirectory, baselines[0]!);
}

async function main(): Promise<void> {
  const migrationPath = await findCurrentBaseline();
  await augmentConsentAiBaseline(migrationPath);
  console.log(`Consent and AI integrity objects verified in ${migrationPath}`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
