import type { ClientLifecycleMode, ClientLifecycleStatus } from "./client-lifecycle";
import {
  clientLifecycleStatusValues,
  clientLifecycleModeValues
} from "./client-lifecycle";
import type {
  ClientAstrologerRelationship,
  ClientBirthData,
  ClientRelatedBirthProfile,
  ClientRelationshipSource
} from "./client-types";

const clientRelationshipSourceValues = [
  "direct_link",
  "booking",
  "order",
  "lead_magnet",
  "manual"
] as const;

export type ClientCrmRelationship = Pick<
  ClientAstrologerRelationship,
  "id" | "status" | "source" | "firstLinkedAt" | "lastLinkedAt"
>;

export type ClientCrmLifecycle = {
  readonly status: ClientLifecycleStatus;
  readonly mode: ClientLifecycleMode;
  readonly revision: number;
  readonly lastActivityAt: string;
};

export type ClientCrmReadiness = {
  readonly birthData: "ready" | "missing";
  readonly relatedProfiles: "ready" | "missing";
};

type ClientCrmActivityBase = {
  readonly id: string;
  readonly occurredAt: string;
  readonly href?: string;
};

export type ClientCrmActivityItem =
  | (ClientCrmActivityBase & {
      readonly kind: "relationship_created";
      readonly metadata: { readonly source: ClientRelationshipSource };
    })
  | (ClientCrmActivityBase & {
      readonly kind: "lifecycle_changed";
      readonly metadata: {
        readonly previousStatus: ClientLifecycleStatus | null;
        readonly status: ClientLifecycleStatus;
        readonly mode: ClientLifecycleMode;
      };
    })
  | (ClientCrmActivityBase & {
      readonly kind: "birth_data_updated";
      readonly metadata: { readonly revision: number };
    })
  | (ClientCrmActivityBase & {
      readonly kind: "related_birth_profile_updated";
      readonly metadata: { readonly relatedProfileId: string; readonly revision: number };
    });

/**
 * Inputs are allowlisted source facts. Owning readers must not load arbitrary
 * source payloads, message content, provider identifiers, or birth snapshots.
 */
export type ClientCrmActivityItemInput =
  | {
      readonly id: string;
      readonly kind: "relationship_created";
      readonly occurredAt: string;
      readonly source: { readonly module: "clients"; readonly source: ClientRelationshipSource };
      readonly href?: string;
    }
  | {
      readonly id: string;
      readonly kind: "lifecycle_changed";
      readonly occurredAt: string;
      readonly source: {
        readonly module: "clients";
        readonly previousStatus: ClientLifecycleStatus | null;
        readonly status: ClientLifecycleStatus;
        readonly mode: ClientLifecycleMode;
      };
      readonly href?: string;
    }
  | {
      readonly id: string;
      readonly kind: "birth_data_updated";
      readonly occurredAt: string;
      readonly source: { readonly module: "clients"; readonly revision: number };
      readonly href?: string;
    }
  | {
      readonly id: string;
      readonly kind: "related_birth_profile_updated";
      readonly occurredAt: string;
      readonly source: {
        readonly module: "clients";
        readonly relatedProfileId: string;
        readonly revision: number;
      };
      readonly href?: string;
    };

export type ClientCrmActivityPage = {
  readonly items: readonly ClientCrmActivityItem[];
  readonly nextCursor: string | null;
};

export type ClientCrmListItem = {
  readonly clientUserId: string;
  readonly displayName: string | null;
  readonly relationship: ClientCrmRelationship;
  readonly lifecycle: ClientCrmLifecycle;
  readonly readiness: ClientCrmReadiness;
};

export type ClientCrmListPage = {
  readonly items: readonly ClientCrmListItem[];
  readonly nextCursor: string | null;
};

export type ClientCrmDetail = ClientCrmListItem & {
  readonly birthData: ClientBirthData | null;
  readonly relatedBirthProfiles: readonly ClientRelatedBirthProfile[];
  readonly activity: ClientCrmActivityPage;
};

export type ClientCrmFailure = {
  readonly kind: "not_found" | "not_related" | "blocked_or_archived" | "conflict" | "invalid_command";
};

export type ClientCrmListResult =
  | { readonly kind: "found"; readonly page: ClientCrmListPage }
  | ClientCrmFailure;

export type ClientCrmDetailResult =
  | { readonly kind: "found"; readonly detail: ClientCrmDetail }
  | ClientCrmFailure;

export type ClientCrmListQuery = {
  readonly query: string;
  readonly cursor: string | null;
  readonly limit: number;
  readonly lifecycle: ClientLifecycleStatus | undefined;
  readonly source: ClientRelationshipSource | undefined;
  readonly sort: "last_linked_at_desc";
};

export type ClientCrmListQueryInput = {
  readonly query?: string | null;
  readonly cursor?: string | null;
  readonly limit?: number;
  readonly lifecycle?: ClientLifecycleStatus;
  readonly source?: ClientRelationshipSource;
  readonly sort?: "last_linked_at_desc";
};

export type ClientCrmReadStore = {
  readonly listAstrologerClientCrmPage: (input: {
    readonly astrologerUserId: string;
    readonly query: ClientCrmListQuery;
  }) => Promise<ClientCrmListResult>;
  readonly getAstrologerClientCrmDetail: (input: {
    readonly astrologerUserId: string;
    readonly clientUserId: string;
  }) => Promise<ClientCrmDetailResult>;
};

export async function listAstrologerClientCrmPage(input: {
  readonly store: ClientCrmReadStore;
  readonly astrologerUserId: string;
  readonly query?: ClientCrmListQueryInput;
}): Promise<ClientCrmListResult> {
  try {
    return await input.store.listAstrologerClientCrmPage({
      astrologerUserId: normalizeRequiredId(input.astrologerUserId),
      query: normalizeListQuery(input.query)
    });
  } catch (error) {
    if (error instanceof ClientCrmCommandValidationError) {
      return { kind: "invalid_command" };
    }
    throw error;
  }
}

export async function getAstrologerClientCrmDetail(input: {
  readonly store: ClientCrmReadStore;
  readonly astrologerUserId: string;
  readonly clientUserId: string;
}): Promise<ClientCrmDetailResult> {
  try {
    const result = await input.store.getAstrologerClientCrmDetail({
      astrologerUserId: normalizeRequiredId(input.astrologerUserId),
      clientUserId: normalizeRequiredId(input.clientUserId)
    });
    return result.kind === "found"
      ? { kind: "found", detail: sortClientCrmDetailActivity(result.detail) }
      : result;
  } catch (error) {
    if (error instanceof ClientCrmCommandValidationError) {
      return { kind: "invalid_command" };
    }
    throw error;
  }
}

export function createClientCrmActivityItem(
  input: ClientCrmActivityItemInput
): ClientCrmActivityItem {
  validateActivityBase(input);

  switch (input.kind) {
    case "relationship_created":
      if (!isOneOf(clientRelationshipSourceValues, input.source.source)) {
        throw new ClientCrmCommandValidationError("CRM relationship source is invalid");
      }
      return withHref({
        id: input.id,
        kind: input.kind,
        occurredAt: input.occurredAt,
        metadata: { source: input.source.source }
      }, input.href);
    case "lifecycle_changed":
      if (
        !isLifecycleStatus(input.source.status) ||
        (input.source.previousStatus !== null && !isLifecycleStatus(input.source.previousStatus)) ||
        !isOneOf(clientLifecycleModeValues, input.source.mode)
      ) {
        throw new ClientCrmCommandValidationError("CRM lifecycle activity is invalid");
      }
      return withHref({
        id: input.id,
        kind: input.kind,
        occurredAt: input.occurredAt,
        metadata: {
          previousStatus: input.source.previousStatus,
          status: input.source.status,
          mode: input.source.mode
        }
      }, input.href);
    case "birth_data_updated":
      validateRevision(input.source.revision);
      return withHref({
        id: input.id,
        kind: input.kind,
        occurredAt: input.occurredAt,
        metadata: { revision: input.source.revision }
      }, input.href);
    case "related_birth_profile_updated":
      validateRequiredString(input.source.relatedProfileId, "CRM related birth profile id is required");
      validateRevision(input.source.revision);
      return withHref({
        id: input.id,
        kind: input.kind,
        occurredAt: input.occurredAt,
        metadata: {
          relatedProfileId: input.source.relatedProfileId,
          revision: input.source.revision
        }
      }, input.href);
  }
}

function normalizeListQuery(input: ClientCrmListQueryInput | undefined): ClientCrmListQuery {
  const query = normalizeOptionalString(input?.query, 100);
  const cursor = input?.cursor === undefined || input.cursor === null
    ? null
    : validateRequiredString(input.cursor, "CRM cursor is required", 512);
  const limit = input?.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new ClientCrmCommandValidationError("CRM list limit is invalid");
  }
  if (input?.lifecycle !== undefined && !isLifecycleStatus(input.lifecycle)) {
    throw new ClientCrmCommandValidationError("CRM lifecycle filter is invalid");
  }
  if (input?.source !== undefined && !isOneOf(clientRelationshipSourceValues, input.source)) {
    throw new ClientCrmCommandValidationError("CRM relationship source filter is invalid");
  }
  if (input?.sort !== undefined && input.sort !== "last_linked_at_desc") {
    throw new ClientCrmCommandValidationError("CRM list sort is invalid");
  }
  return {
    query,
    cursor,
    limit,
    lifecycle: input?.lifecycle,
    source: input?.source,
    sort: "last_linked_at_desc"
  };
}

function sortClientCrmDetailActivity(detail: ClientCrmDetail): ClientCrmDetail {
  return {
    ...detail,
    activity: {
      ...detail.activity,
      items: [...detail.activity.items].sort(compareClientCrmActivityItems)
    }
  };
}

function compareClientCrmActivityItems(
  left: ClientCrmActivityItem,
  right: ClientCrmActivityItem
): number {
  const leftInstant = Date.parse(left.occurredAt);
  const rightInstant = Date.parse(right.occurredAt);
  if (leftInstant !== rightInstant) {
    return leftInstant < rightInstant ? 1 : -1;
  }
  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}

function withHref<T extends ClientCrmActivityItemBase>(item: T, href: string | undefined): T {
  if (href === undefined) return item;
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\") || href.length > 500) {
    throw new ClientCrmCommandValidationError("CRM activity href is invalid");
  }
  return { ...item, href };
}

function validateActivityBase(input: ClientCrmActivityItemInput): void {
  validateRequiredString(input.id, "CRM activity id is required", 200);
  if (!Number.isFinite(Date.parse(input.occurredAt))) {
    throw new ClientCrmCommandValidationError("CRM activity occurrence time is invalid");
  }
  if (input.source.module !== "clients") {
    throw new ClientCrmCommandValidationError("CRM activity source module is invalid");
  }
}

function validateRevision(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new ClientCrmCommandValidationError("CRM activity revision is invalid");
  }
}

function normalizeRequiredId(value: string): string {
  return validateRequiredString(value, "CRM user id is required");
}

function normalizeOptionalString(value: string | null | undefined, maxLength: number): string {
  if (value === undefined || value === null) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length > maxLength) {
    throw new ClientCrmCommandValidationError("CRM query is invalid");
  }
  return normalized;
}

function validateRequiredString(value: string, message: string, maxLength = Number.POSITIVE_INFINITY): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new ClientCrmCommandValidationError(message);
  }
  return normalized;
}

function isLifecycleStatus(value: string): value is ClientLifecycleStatus {
  return isOneOf(clientLifecycleStatusValues, value);
}

function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
  return values.includes(value as T);
}

class ClientCrmCommandValidationError extends Error {}

type ClientCrmActivityItemBase = {
  readonly id: string;
  readonly kind: ClientCrmActivityItem["kind"];
  readonly occurredAt: string;
  readonly metadata: ClientCrmActivityItem["metadata"];
};
