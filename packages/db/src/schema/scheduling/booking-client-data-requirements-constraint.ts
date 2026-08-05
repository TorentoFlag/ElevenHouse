import {
  productExecutionModeValues,
  productMethodValues,
  productParticipantModeValues,
  productRequiredClientDataValues
} from "../products/product-values";

export const bookingClientDataRequirementsConstraintName =
  "bookings_client_data_requirements_snapshot_check" as const;

export function bookingClientDataRequirementsSnapshotPredicateSql(
  columnExpression = '"client_data_requirements_snapshot"'
): string {
  return `jsonb_typeof(${columnExpression}) = 'object' and (
    (
      ${columnExpression}->>'schemaVersion' = 'booking-client-data-requirements.v1'
      and jsonb_array_length(jsonb_path_query_array(${columnExpression}, '$.keyvalue().key')) = 5
      and jsonb_path_query_array(${columnExpression}, '$.keyvalue().key') <@ '["schemaVersion","executionMode","participantMode","requiredClientData","methods"]'::jsonb
      and ${columnExpression}->>'executionMode' in ${formatSqlValues(productExecutionModeValues)}
      and ${columnExpression}->>'participantMode' in ${formatSqlValues(productParticipantModeValues)}
      and jsonb_typeof(${columnExpression}->'requiredClientData') = 'array'
      and jsonb_path_query_array(${columnExpression}->'requiredClientData', '$[*] ? (@.type() == "string")') = ${columnExpression}->'requiredClientData'
      and ${columnExpression}->'requiredClientData' <@ ${formatJsonbArray(productRequiredClientDataValues)}
      and jsonb_array_length(${columnExpression}->'requiredClientData') = ${uniqueJsonbArrayCardinalitySql(columnExpression, "requiredClientData", productRequiredClientDataValues)}
      and jsonb_typeof(${columnExpression}->'methods') = 'array'
      and jsonb_path_query_array(${columnExpression}->'methods', '$[*] ? (@.type() == "string")') = ${columnExpression}->'methods'
      and ${columnExpression}->'methods' <@ ${formatJsonbArray(productMethodValues)}
      and jsonb_array_length(${columnExpression}->'methods') = ${uniqueJsonbArrayCardinalitySql(columnExpression, "methods", productMethodValues)}
    )
  )`;
}

function formatSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

function formatJsonbArray(values: readonly string[]): string {
  return `'${JSON.stringify(values)}'::jsonb`;
}

function uniqueJsonbArrayCardinalitySql(
  columnExpression: string,
  propertyName: string,
  values: readonly string[]
): string {
  return values
    .map(
      (value) =>
        `(case when ${columnExpression}->'${propertyName}' @> '[${JSON.stringify(value)}]'::jsonb then 1 else 0 end)`
    )
    .join(" + ");
}
