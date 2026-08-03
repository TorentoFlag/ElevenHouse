import {
  migrateFlowDefinitionV2RequestSchema,
  migrateFlowDefinitionV2ResponseSchema,
  type MigrateFlowDefinitionV2Request,
  type MigrateFlowDefinitionV2Response
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type MigrateFlowDefinitionInput = {
  readonly flowId: string;
  readonly body: MigrateFlowDefinitionV2Request;
  readonly idempotencyKey: string;
};

export async function migrateFlowDefinition(
  input: MigrateFlowDefinitionInput
): Promise<MigrateFlowDefinitionV2Response> {
  const body = migrateFlowDefinitionV2RequestSchema.parse(input.body);

  return migrateFlowDefinitionV2ResponseSchema.parse(
    await application.http.post(`/flows/${input.flowId}/migrations/v2`, body, {
      csrf: true,
      headers: { "idempotency-key": input.idempotencyKey }
    })
  );
}
