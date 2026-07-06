import {
  approveCalculationInterpretationRequestSchema,
  calculationIdParamSchema,
  calculationInterpretationIdParamSchema,
  calculationRecordResponseSchema,
  linkCalculationClientRequestSchema,
  listCalculationsQuerySchema,
  listCalculationsResponseSchema,
  publishCalculationRequestSchema,
  saveCalculationInterpretationRequestSchema,
  type CalculationRecordResponse,
  type LinkCalculationClientRequest,
  type ListCalculationsQuery,
  type ListCalculationsResponse,
  type PublishCalculationRequest,
  type SaveCalculationInterpretationRequest
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listCalculations(
  query: ListCalculationsQuery
): Promise<ListCalculationsResponse> {
  const normalizedQuery = listCalculationsQuerySchema.parse(query);
  const params = new URLSearchParams({
    module: normalizedQuery.module,
    status: normalizedQuery.status,
    limit: String(normalizedQuery.limit),
    offset: String(normalizedQuery.offset)
  });

  return listCalculationsResponseSchema.parse(
    await application.http.get(`/calculations?${params.toString()}`)
  );
}

export async function getCalculation(calculationId: string): Promise<CalculationRecordResponse> {
  const params = calculationIdParamSchema.parse({ calculationId });

  return calculationRecordResponseSchema.parse(
    await application.http.get(`/calculations/${params.calculationId}`)
  );
}

export async function linkCalculationClient(input: {
  readonly calculationId: string;
  readonly body: LinkCalculationClientRequest;
}): Promise<CalculationRecordResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  const body = linkCalculationClientRequestSchema.parse(input.body);

  return calculationRecordResponseSchema.parse(
    await application.http.post(`/calculations/${params.calculationId}/link-client`, body, {
      csrf: true
    })
  );
}

export async function saveCalculationInterpretation(input: {
  readonly calculationId: string;
  readonly body: SaveCalculationInterpretationRequest;
}): Promise<CalculationRecordResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  const body = saveCalculationInterpretationRequestSchema.parse(input.body);

  return calculationRecordResponseSchema.parse(
    await application.http.post(`/calculations/${params.calculationId}/interpretations`, body, {
      csrf: true
    })
  );
}

export async function approveCalculationInterpretation(input: {
  readonly calculationId: string;
  readonly interpretationId: string;
}): Promise<CalculationRecordResponse> {
  const params = calculationInterpretationIdParamSchema.parse(input);
  const body = approveCalculationInterpretationRequestSchema.parse({});

  return calculationRecordResponseSchema.parse(
    await application.http.post(
      `/calculations/${params.calculationId}/interpretations/${params.interpretationId}/approve`,
      body,
      { csrf: true }
    )
  );
}

export async function publishCalculation(input: {
  readonly calculationId: string;
  readonly body: PublishCalculationRequest;
}): Promise<CalculationRecordResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  const body = publishCalculationRequestSchema.parse(input.body);

  return calculationRecordResponseSchema.parse(
    await application.http.post(`/calculations/${params.calculationId}/publish`, body, {
      csrf: true
    })
  );
}

export async function archiveCalculation(
  calculationId: string
): Promise<CalculationRecordResponse> {
  const params = calculationIdParamSchema.parse({ calculationId });

  return calculationRecordResponseSchema.parse(
    await application.http.post(`/calculations/${params.calculationId}/archive`, undefined, {
      csrf: true
    })
  );
}
