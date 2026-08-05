/**
 * PostgreSQL implementation of finance canonical JSON v1.
 *
 * UTF-8 byte ordering under the C collation preserves Unicode code-point ordering. JSON arrays
 * retain ordinality; objects are recursively rebuilt; and numbers are limited to the same safe
 * integer domain accepted by the TypeScript authority.
 */
export const financeCanonicalJsonV1Sql = `
create extension if not exists pgcrypto;

create or replace function finance_canonical_jsonb_v1(input_value jsonb)
returns text
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog, public
as $$
declare
  value_kind text := jsonb_typeof(input_value);
  rendered text;
begin
  if value_kind = 'null' then
    return 'null';
  elsif value_kind = 'boolean' or value_kind = 'string' then
    return input_value::text;
  elsif value_kind = 'number' then
    rendered := input_value::text;
    if rendered !~ '^-?(0|[1-9][0-9]*)$'
       or rendered::numeric < -9007199254740991
       or rendered::numeric > 9007199254740991 then
      raise exception 'finance canonical JSON numbers must be safe integers'
        using errcode = '22023';
    end if;
    if rendered = '-0' then
      return '0';
    end if;
    return rendered;
  elsif value_kind = 'array' then
    select '[' || coalesce(
      string_agg(
        finance_canonical_jsonb_v1(entry.value),
        ',' order by entry.ordinality
      ),
      ''
    ) || ']'
      into rendered
      from jsonb_array_elements(input_value) with ordinality as entry(value, ordinality);
    return rendered;
  elsif value_kind = 'object' then
    select '{' || coalesce(
      string_agg(
        finance_canonical_jsonb_v1(to_jsonb(entry.key)) || ':' ||
          finance_canonical_jsonb_v1(entry.value),
        ',' order by entry.key collate "C"
      ),
      ''
    ) || '}'
      into rendered
      from jsonb_each(input_value) as entry(key, value);
    return rendered;
  end if;

  raise exception 'unsupported finance canonical JSON value'
    using errcode = '22023';
end;
$$;
`;
