import { relations } from "drizzle-orm";
import { clientJoinIntents } from "../clients/client-join-intents.schema";
import { users } from "../identity/accounts.schema";
import { products } from "../products/products.schema";
import { financeIdempotencyCommands } from "./idempotency-commands.schema";
import {
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
  walletBalanceReadModels
} from "./ledger.schema";
import { orders } from "./orders.schema";
import { paymentReversalCaseReviews } from "./payment-reversal-case-reviews.schema";
import { paymentAttempts, paymentProviderEvents, refunds } from "./payments.schema";
import { astrologerRiskProfiles, financePolicies } from "./policies.schema";
import { payoutMethodVersions, payoutMethods, payoutRequests } from "./payouts.schema";
import { reconciliationRecords } from "./reconciliation.schema";

export const ordersRelations = relations(orders, ({ many, one }) => ({
  client: one(users, { fields: [orders.clientUserId], references: [users.id] }),
  astrologer: one(users, { fields: [orders.astrologerUserId], references: [users.id] }),
  product: one(products, { fields: [orders.productId], references: [products.id] }),
  directLinkIntent: one(clientJoinIntents, {
    fields: [orders.directLinkIntentId],
    references: [clientJoinIntents.id]
  }),
  financePolicySnapshot: one(financePolicies, {
    fields: [orders.financePolicySnapshotId],
    references: [financePolicies.id]
  }),
  paymentAttempts: many(paymentAttempts),
  refunds: many(refunds),
  ledgerTransactions: many(ledgerTransactions)
}));

export const paymentAttemptsRelations = relations(paymentAttempts, ({ many, one }) => ({
  order: one(orders, { fields: [paymentAttempts.orderId], references: [orders.id] }),
  providerEvents: many(paymentProviderEvents),
  refunds: many(refunds)
}));

export const paymentProviderEventsRelations = relations(paymentProviderEvents, ({ many, one }) => ({
  paymentAttempt: one(paymentAttempts, {
    fields: [paymentProviderEvents.paymentAttemptId],
    references: [paymentAttempts.id]
  }),
  refunds: many(refunds),
  reversalCaseReviews: many(paymentReversalCaseReviews),
  reconciliationRecords: many(reconciliationRecords)
}));

export const paymentReversalCaseReviewsRelations = relations(
  paymentReversalCaseReviews,
  ({ one }) => ({
    providerEvent: one(paymentProviderEvents, {
      fields: [paymentReversalCaseReviews.providerEventId],
      references: [paymentProviderEvents.id]
    }),
    admin: one(users, {
      fields: [paymentReversalCaseReviews.adminUserId],
      references: [users.id]
    })
  })
);

export const refundsRelations = relations(refunds, ({ one }) => ({
  order: one(orders, { fields: [refunds.orderId], references: [orders.id] }),
  paymentAttempt: one(paymentAttempts, {
    fields: [refunds.paymentAttemptId],
    references: [paymentAttempts.id]
  }),
  providerEvent: one(paymentProviderEvents, {
    fields: [refunds.providerEventId],
    references: [paymentProviderEvents.id]
  })
}));

export const ledgerAccountsRelations = relations(ledgerAccounts, ({ many, one }) => ({
  astrologer: one(users, { fields: [ledgerAccounts.astrologerUserId], references: [users.id] }),
  entries: many(ledgerEntries)
}));

export const ledgerTransactionsRelations = relations(ledgerTransactions, ({ many, one }) => ({
  order: one(orders, { fields: [ledgerTransactions.orderId], references: [orders.id] }),
  payoutRequest: one(payoutRequests, {
    fields: [ledgerTransactions.payoutRequestId],
    references: [payoutRequests.id]
  }),
  entries: many(ledgerEntries)
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  transaction: one(ledgerTransactions, {
    fields: [ledgerEntries.ledgerTransactionId],
    references: [ledgerTransactions.id]
  }),
  account: one(ledgerAccounts, {
    fields: [ledgerEntries.accountId],
    references: [ledgerAccounts.id]
  })
}));

export const walletBalanceReadModelsRelations = relations(walletBalanceReadModels, ({ one }) => ({
  astrologer: one(users, {
    fields: [walletBalanceReadModels.astrologerUserId],
    references: [users.id]
  })
}));

export const payoutMethodsRelations = relations(payoutMethods, ({ many, one }) => ({
  astrologer: one(users, { fields: [payoutMethods.astrologerUserId], references: [users.id] }),
  payoutRequests: many(payoutRequests),
  versions: many(payoutMethodVersions)
}));

export const payoutMethodVersionsRelations = relations(payoutMethodVersions, ({ one }) => ({
  payoutMethod: one(payoutMethods, {
    fields: [payoutMethodVersions.payoutMethodId],
    references: [payoutMethods.id]
  })
}));

export const payoutRequestsRelations = relations(payoutRequests, ({ many, one }) => ({
  astrologer: one(users, { fields: [payoutRequests.astrologerUserId], references: [users.id] }),
  payoutMethod: one(payoutMethods, {
    fields: [payoutRequests.payoutMethodId],
    references: [payoutMethods.id]
  }),
  admin: one(users, { fields: [payoutRequests.adminUserId], references: [users.id] }),
  ledgerTransactions: many(ledgerTransactions)
}));

export const financePoliciesRelations = relations(financePolicies, ({ many, one }) => ({
  createdBy: one(users, { fields: [financePolicies.createdByUserId], references: [users.id] }),
  orders: many(orders)
}));

export const astrologerRiskProfilesRelations = relations(astrologerRiskProfiles, ({ one }) => ({
  astrologer: one(users, {
    fields: [astrologerRiskProfiles.astrologerUserId],
    references: [users.id]
  }),
  reviewedBy: one(users, {
    fields: [astrologerRiskProfiles.reviewedByUserId],
    references: [users.id]
  })
}));

export const reconciliationRecordsRelations = relations(reconciliationRecords, ({ one }) => ({
  providerEvent: one(paymentProviderEvents, {
    fields: [reconciliationRecords.providerEventId],
    references: [paymentProviderEvents.id]
  })
}));

export const financeIdempotencyCommandsRelations = relations(
  financeIdempotencyCommands,
  ({ one }) => ({
    actor: one(users, {
      fields: [financeIdempotencyCommands.actorUserId],
      references: [users.id]
    })
  })
);
