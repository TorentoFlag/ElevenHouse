import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeSavedCardSetupCustomerActionIntegritySql,
  financeSavedCardSetupCustomerActions
} from "./saved-card-setup-actions.schema";

describe("saved-card setup customer action schema", () => {
  it("keeps only safe action metadata in PostgreSQL and fences it to the exact setup and provider response", () => {
    expect(getTableName(financeSavedCardSetupCustomerActions)).toBe(
      "finance_saved_card_setup_customer_actions"
    );
    expect(Object.keys(getTableColumns(financeSavedCardSetupCustomerActions))).toEqual([
      "id",
      "setupSessionId",
      "setupSessionVersion",
      "providerOperationIntentId",
      "providerOperationIntentVersion",
      "providerResponseArtifactId",
      "providerResponseArtifactDigest",
      "actionType",
      "phase",
      "status",
      "createdAt",
      "resolvedAt"
    ]);
    expect(getTableConfig(financeSavedCardSetupCustomerActions).foreignKeys.map((item) => item.getName())).toEqual(
      expect.arrayContaining([
        "finance_saved_card_setup_customer_actions_session_fk",
        "finance_saved_card_setup_customer_actions_operation_fk",
        "finance_saved_card_setup_customer_actions_artifact_fk"
      ])
    );
    expect(financeSavedCardSetupCustomerActionIntegritySql).toContain(
      "saved-card customer action is cross-wired"
    );
    expect(financeSavedCardSetupCustomerActionIntegritySql).toContain(
      "saved-card customer action identity is immutable"
    );
  });
});
