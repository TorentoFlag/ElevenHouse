import { getTableColumns } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import {
  financeProviderSemanticFacts,
  financeWebhookInboxIntegritySql,
  financeWebhookSemanticCommitReceipts
} from "./webhook-inbox.schema";

describe("provider canonical-read semantic evidence schema", () => {
  test("permits direct canonical provider reads without inventing a webhook inbox row", () => {
    expect(getTableColumns(financeProviderSemanticFacts).inboxItemId.notNull).toBe(false);
    expect(getTableColumns(financeWebhookSemanticCommitReceipts).inboxItemId.notNull).toBe(false);
    expect(getTableColumns(financeWebhookSemanticCommitReceipts).inboxVersion.notNull).toBe(false);
    expect(getTableColumns(financeWebhookSemanticCommitReceipts).checkpointSequence.notNull).toBe(
      false
    );
    expect(getTableColumns(financeWebhookSemanticCommitReceipts).processingStatus.notNull).toBe(
      false
    );
    expect(financeWebhookInboxIntegritySql).toContain("if semantic.inbox_item_id is null then");
    expect(financeWebhookInboxIntegritySql).toContain("'sourceDelivery'");
    expect(financeWebhookInboxIntegritySql).toContain("provider_canonical_read");
  });
});
