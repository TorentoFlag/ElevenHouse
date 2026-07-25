import type { Money } from "../money";
import type { FinancePaymentProvider, PaymentProviderEnvironment } from "./payment-store";

export type PaymentCheckoutRequest = {
  readonly paymentAttemptId: string;
  readonly orderId: string;
  readonly amount: Money;
  readonly successUrl: string;
  readonly failureUrl: string;
  readonly cancelUrl: string;
};

export type PaymentCheckoutSession = {
  readonly providerCheckoutId: string;
  readonly checkoutUrl: string;
};

export type PaymentProviderPort = {
  readonly provider: FinancePaymentProvider;
  readonly environment: PaymentProviderEnvironment;
  readonly openCheckout: (input: PaymentCheckoutRequest) => Promise<PaymentCheckoutSession>;
};
