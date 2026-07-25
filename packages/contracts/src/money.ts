import { z } from "@elevenhouse/validation";

export const rubCurrencyValues = ["RUB"] as const;
export const rubCurrencySchema = z.enum(rubCurrencyValues);
export type RubCurrency = z.infer<typeof rubCurrencySchema>;

export const moneyAmountMinorSchema = z.number().int().safe().min(0);
export const positiveMoneyAmountMinorSchema = z.number().int().safe().positive();

export const moneySchema = z
  .object({
    amountMinor: moneyAmountMinorSchema,
    currency: rubCurrencySchema
  })
  .strict();
export type Money = z.infer<typeof moneySchema>;

export const nonZeroMoneySchema = z
  .object({
    amountMinor: positiveMoneyAmountMinorSchema,
    currency: rubCurrencySchema
  })
  .strict();
export type NonZeroMoney = z.infer<typeof nonZeroMoneySchema>;

export const basisPointsSchema = z.number().int().min(0).max(10_000);
export type BasisPoints = z.infer<typeof basisPointsSchema>;
