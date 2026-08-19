const arcPayProviderAccountSeedEnvironmentKeys = [
  "FINANCE_ARC_PAY_PROVIDER_ACCOUNT_SERIES_ID",
  "FINANCE_ARC_PAY_PROVIDER_ACCOUNT_ID",
  "FINANCE_ARC_PAY_MERCHANT_TENANT_ID",
  "FINANCE_ARC_PAY_TERMINAL_SCOPE",
  "FINANCE_ARC_PAY_SETTLEMENT_SCOPE"
] as const;

type ArcPayProviderAccountSeedEnvironmentKey =
  (typeof arcPayProviderAccountSeedEnvironmentKeys)[number];

export type ArcPayProviderAccountSeedData = Readonly<{
  seriesId: string;
  providerAccountId: string;
  identityVersion: 1;
  provider: "arc_pay";
  merchantTenantId: string;
  terminalScope: string;
  settlementScope: string;
}>;

export function resolveArcPayProviderAccountSeedData(
  env: Readonly<Partial<Record<ArcPayProviderAccountSeedEnvironmentKey, string>>>
): ArcPayProviderAccountSeedData | null {
  const presentKeys = arcPayProviderAccountSeedEnvironmentKeys.filter((key) =>
    hasConfiguredValue(env[key])
  );
  if (presentKeys.length === 0) {
    return null;
  }
  if (presentKeys.length !== arcPayProviderAccountSeedEnvironmentKeys.length) {
    const missing = arcPayProviderAccountSeedEnvironmentKeys.filter(
      (key) => !hasConfiguredValue(env[key])
    );
    throw new Error(`Incomplete ArcPay provider account seed env: missing ${missing.join(", ")}`);
  }

  return Object.freeze({
    seriesId: identityString(env.FINANCE_ARC_PAY_PROVIDER_ACCOUNT_SERIES_ID),
    providerAccountId: identityString(env.FINANCE_ARC_PAY_PROVIDER_ACCOUNT_ID),
    identityVersion: 1,
    provider: "arc_pay",
    merchantTenantId: identityString(env.FINANCE_ARC_PAY_MERCHANT_TENANT_ID),
    terminalScope: identityString(env.FINANCE_ARC_PAY_TERMINAL_SCOPE),
    settlementScope: identityString(env.FINANCE_ARC_PAY_SETTLEMENT_SCOPE)
  });
}

function hasConfiguredValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function identityString(value: string | undefined): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    hasAsciiControlCharacter(value)
  ) {
    throw new Error("Invalid ArcPay provider account seed identity field");
  }
  return value;
}

function hasAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}
