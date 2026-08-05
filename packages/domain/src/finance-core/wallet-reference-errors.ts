export class WalletProjectionIntegrityError extends Error {
  readonly code = "wallet_projection_integrity_violation";

  constructor() {
    super("Wallet projection input violates journal, lot or read-model invariants");
    this.name = "WalletProjectionIntegrityError";
  }
}

export function invalidWalletProjection(): never {
  throw new WalletProjectionIntegrityError();
}
