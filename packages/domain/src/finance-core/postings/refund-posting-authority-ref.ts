import type { FinanceAuthorizationPayloadHash } from "../../finance-authorization/canonical-command-payload";

export type RefundPostingAuthorityRef<Kind extends string = string> = Readonly<{
  kind: Kind;
  authorityId: string;
  version: number;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;
