export type ArcPayPaymentAttemptResolver = {
  readonly resolvePaymentAttemptId: (input: {
    readonly providerPaymentId: string;
    readonly environment: "sandbox" | "live";
  }) => Promise<string>;
};

export class ArcPayPaymentLookupError extends Error {
  constructor() {
    super("Arc Pay payment lookup did not return a valid payment reference");
    this.name = "ArcPayPaymentLookupError";
  }
}

export function createArcPayPaymentAttemptResolver(input: {
  readonly apiBaseUrl: string;
  readonly apiSecret: string | null;
  readonly environment: "sandbox" | "live";
  readonly fetchImpl?: typeof fetch;
}): ArcPayPaymentAttemptResolver {
  const fetchImpl = input.fetchImpl ?? fetch;
  return {
    async resolvePaymentAttemptId({ providerPaymentId, environment }): Promise<string> {
      if (!input.apiSecret || environment !== input.environment)
        throw new ArcPayPaymentLookupError();
      let response: Response;
      try {
        response = await fetchImpl(
          new URL(`/v1/payments/${encodeURIComponent(providerPaymentId)}`, input.apiBaseUrl),
          { headers: { authorization: `Bearer ${input.apiSecret}` } }
        );
      } catch {
        throw new ArcPayPaymentLookupError();
      }
      if (!response.ok) throw new ArcPayPaymentLookupError();
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ArcPayPaymentLookupError();
      }
      if (!isPaymentReference(payload, providerPaymentId)) throw new ArcPayPaymentLookupError();
      return payload.external_id;
    }
  };
}

function isPaymentReference(
  value: unknown,
  providerPaymentId: string
): value is { readonly id: string; readonly external_id: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.id === providerPaymentId &&
    typeof payload.external_id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      payload.external_id
    )
  );
}
