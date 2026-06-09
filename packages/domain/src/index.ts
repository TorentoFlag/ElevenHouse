export type DomainEvent<TName extends string, TPayload extends Record<string, unknown>> = {
  readonly id: string;
  readonly name: TName;
  readonly occurredAt: string;
  readonly payload: TPayload;
};

export function createDomainEvent<TName extends string, TPayload extends Record<string, unknown>>(
  input: {
    readonly id: string;
    readonly name: TName;
    readonly occurredAt: Date;
    readonly payload: TPayload;
  }
): DomainEvent<TName, TPayload> {
  return {
    id: input.id,
    name: input.name,
    occurredAt: input.occurredAt.toISOString(),
    payload: input.payload
  };
}
