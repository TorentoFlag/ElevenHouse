export const identityProviderValues = ["email", "phone", "telegram", "google", "apple"] as const;
export type IdentityProvider = (typeof identityProviderValues)[number];

export type AuthIdentity = {
  readonly id: string;
  readonly userId: string;
  readonly provider: IdentityProvider;
  readonly providerSubject: string;
  readonly email?: string;
  readonly phoneNumber?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AuthIdentityInput = {
  readonly provider: IdentityProvider;
  readonly providerSubject: string;
  readonly email?: string;
  readonly phoneNumber?: string;
  readonly passwordHash?: string;
};

const identityProviderSet = new Set<string>(identityProviderValues);

export function isIdentityProvider(value: string): value is IdentityProvider {
  return identityProviderSet.has(value);
}

export function normalizeAuthIdentityInput(identity: AuthIdentityInput): AuthIdentityInput {
  if (!isIdentityProvider(identity.provider)) {
    throw new Error(`Unsupported identity provider: ${identity.provider}`);
  }

  const providerSubject = identity.providerSubject.trim();
  if (providerSubject.length === 0) {
    throw new Error("Auth identities require a provider subject");
  }

  const email = normalizeOptionalString(identity.email);
  const phoneNumber = normalizeOptionalString(identity.phoneNumber);

  if (identity.provider === "email" && !email) {
    throw new Error("Email identities require an email address");
  }

  if (identity.provider === "email" && !identity.passwordHash?.trim()) {
    throw new Error("Email identities require a password hash");
  }

  if (identity.passwordHash && identity.passwordHash.trim() !== identity.passwordHash) {
    throw new Error("Auth identity password hashes must not contain surrounding whitespace");
  }

  if (identity.provider === "phone" && !phoneNumber) {
    throw new Error("Phone identities require a phone number");
  }

  const normalizedIdentity = {
    provider: identity.provider,
    providerSubject,
    ...(email ? { email } : {}),
    ...(phoneNumber ? { phoneNumber } : {}),
    ...(identity.passwordHash ? { passwordHash: identity.passwordHash } : {})
  } satisfies AuthIdentityInput;

  return normalizedIdentity;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
