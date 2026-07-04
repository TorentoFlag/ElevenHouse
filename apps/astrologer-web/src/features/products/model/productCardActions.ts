import type { ProductResponse } from "@elevenhouse/contracts";

export type ProductCardActionLabels = {
  readonly menuLabel: string;
  readonly editLabel: string;
  readonly duplicateLabel: string;
  readonly publishLabel: string;
  readonly draftLabel: string;
  readonly archiveLabel: string;
};

export type ProductCardActionKind = "edit" | "duplicate" | "publish" | "draft" | "archive";

export type ProductCardActionItem = {
  readonly kind: ProductCardActionKind;
  readonly label: string;
  readonly targetStatus?: ProductResponse["status"];
};

export function getProductCardActionItems(
  status: ProductResponse["status"],
  labels: ProductCardActionLabels
): readonly ProductCardActionItem[] {
  return [
    { kind: "edit", label: labels.editLabel },
    { kind: "duplicate", label: labels.duplicateLabel },
    ...(status === "draft"
      ? [{ kind: "publish" as const, label: labels.publishLabel, targetStatus: "active" as const }]
      : []),
    ...(status !== "draft"
      ? [{ kind: "draft" as const, label: labels.draftLabel, targetStatus: "draft" as const }]
      : []),
    ...(status !== "archived"
      ? [{ kind: "archive" as const, label: labels.archiveLabel, targetStatus: "archived" as const }]
      : [])
  ];
}
