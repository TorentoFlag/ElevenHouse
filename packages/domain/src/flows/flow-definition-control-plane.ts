import {
  createFlowDefinitionV2RequestSchema,
  createNextFlowDraftV2RequestSchema,
  flowApprovalModeSchema,
  flowCapabilityManifestSchema,
  flowDefinitionV2Schema,
  flowGraphReadSchema,
  flowPublishedVersionCompatibleSchema,
  flowVersionSchema,
  migrateFlowDefinitionV2RequestSchema,
  migrateFlowDefinitionV2ResponseSchema,
  publishFlowDefinitionV2RequestSchema,
  publishFlowDefinitionCompatibleResponseSchema,
  publishFlowDefinitionV2ResponseSchema,
  publishFlowDefinitionV3ResponseSchema,
  updateFlowDefinitionDraftV2RequestSchema,
  type CreateFlowDefinitionV2Request,
  type CreateFlowDefinitionV2RequestInput,
  type CreateNextFlowDraftV2Request,
  type FlowApprovalMode,
  type FlowCapabilityManifest,
  type FlowCapabilityManifestV1,
  type FlowCapabilityManifestV2,
  type FlowDefinitionCommandRejection,
  type FlowDefinitionCommandRejectionResponse,
  type FlowDefinitionOriginV1,
  type FlowDefinitionState,
  type FlowDefinitionV2,
  type FlowGraphRead,
  type FlowGraphV2,
  type FlowPresentationV1,
  type FlowPublishedVersionCompatible,
  type MigrateFlowDefinitionV2Request,
  type MigrateFlowDefinitionV2Response,
  type PublishFlowDefinitionV2Request,
  type PublishFlowDefinitionCompatibleResponse,
  type PublishFlowDefinitionV2Response,
  type PublishFlowDefinitionV3Response,
  type UpdateFlowDefinitionDraftV2Request
} from "@elevenhouse/contracts";

import {
  sha256CanonicalJson,
  stableJson,
  type CanonicalJson
} from "../calculations/canonical-json";
import {
  compileFlowGraphV2,
  projectFlowCapabilityManifestV1,
  type FlowGraphV2CompileIssue
} from "./flow-graph-v2-compiler";
import { verifyFlowCapabilityManifestForGraph } from "./flow-capability-manifest-integrity";
import { prepareFlowDefinitionV1Migration } from "./flow-definition-migration";
import {
  prepareFlowDefinitionV2Creation,
  type FlowDefinitionPreparedCreate
} from "./flow-definition-templates";

export const FLOW_DEFINITION_COMMAND_REPLAY_WINDOW_HOURS = 24;
export type FlowPublicationResponseVersion = "legacy_v2" | "current_v3";
export type FlowPublicationPersistenceVersion = "legacy_v1" | "current_v2";

export type FlowDefinitionCommandScope =
  | "flows.definition.create.v2"
  | "flows.definition.update-draft.v2"
  | "flows.definition.publish.v2"
  | "flows.definition.create-next-draft.v2"
  | "flows.definition.migrate.v2";

export type FlowDefinitionRouteTemplate =
  | "/flows"
  | "/flows/:flowId/draft"
  | "/flows/:flowId/publish"
  | "/flows/:flowId/next-draft"
  | "/flows/:flowId/migrations/v2";

export type FlowDefinitionCommand = {
  readonly apiSurface: "astrologer-api";
  readonly routeTemplate: FlowDefinitionRouteTemplate;
  readonly scope: FlowDefinitionCommandScope;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly resourceId: string;
  readonly expectedRevision: number | null;
  readonly idempotencyKey: string;
  readonly requestHash: `sha256:${string}`;
  readonly now: string;
};

export type FlowDefinitionControlRecord = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly origin: FlowDefinitionOriginV1 | null;
  readonly state: FlowDefinitionState;
  readonly approvalMode: FlowApprovalMode;
  readonly revision: number;
  readonly draftBaseVersionId: string | null;
  readonly draftGraph: FlowGraphRead;
  readonly draftPresentation: FlowPresentationV1 | null;
  readonly latestPublishedVersionId: string | null;
  readonly latestPublishedVersion: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
};

export type FlowDefinitionPublishedVersionRecord = {
  readonly id: string;
  readonly flowId: string;
  readonly version: number;
  readonly sourceRevision: number | null;
  readonly approvalMode: FlowApprovalMode;
  readonly graph: FlowGraphRead;
  readonly presentation: FlowPresentationV1 | null;
  readonly capabilityManifest: FlowCapabilityManifest | null;
  readonly publishedAt: string;
};

export type FlowDefinitionPreparedPublication = {
  readonly sourceRevision: number;
  readonly approvalMode: FlowApprovalMode;
  readonly graph: FlowGraphV2;
  readonly presentation: FlowPresentationV1 | null;
  readonly capabilityManifest: FlowCapabilityManifestV2;
  readonly legacyCapabilityManifest: FlowCapabilityManifestV1;
};

export type FlowDefinitionCommandOutcome<T> =
  | {
      readonly kind: "succeeded";
      readonly response: { readonly statusCode: 200 | 201; readonly body: T };
    }
  | { readonly kind: "rejected"; readonly response: FlowDefinitionCommandRejectionResponse };

export type FlowDefinitionCommandResult<T> = {
  readonly kind: "created" | "replayed";
  readonly outcome: FlowDefinitionCommandOutcome<T>;
};

export type FlowDefinitionPreparation<T> =
  | { readonly kind: "accepted"; readonly value: T }
  | { readonly kind: "rejected"; readonly response: FlowDefinitionCommandRejectionResponse };

export type FlowDefinitionControlStore = {
  readonly executeCreate: (input: {
    readonly command: FlowDefinitionCommand;
    readonly prepare: () => FlowDefinitionPreparation<FlowDefinitionPreparedCreate>;
  }) => Promise<FlowDefinitionCommandResult<FlowDefinitionV2>>;
  readonly executeDraftUpdate: (input: {
    readonly command: FlowDefinitionCommand;
    readonly prepare: (
      current: FlowDefinitionControlRecord
    ) => FlowDefinitionPreparation<FlowDefinitionV2>;
  }) => Promise<FlowDefinitionCommandResult<FlowDefinitionV2>>;
  readonly executePublish: (input: {
    readonly command: FlowDefinitionCommand;
    readonly prepare: (
      current: FlowDefinitionControlRecord
    ) => FlowDefinitionPreparation<FlowDefinitionPreparedPublication>;
    readonly responseVersion: FlowPublicationResponseVersion;
    readonly persistenceVersion: FlowPublicationPersistenceVersion;
    readonly assertCreatedResponse: (response: unknown) => void;
  }) => Promise<FlowDefinitionCommandResult<PublishFlowDefinitionCompatibleResponse>>;
  readonly executeCreateNextDraft: (input: {
    readonly command: FlowDefinitionCommand;
    readonly prepare: (
      current: FlowDefinitionControlRecord,
      latestVersion: FlowDefinitionPublishedVersionRecord | null
    ) => FlowDefinitionPreparation<FlowDefinitionV2>;
  }) => Promise<FlowDefinitionCommandResult<FlowDefinitionV2>>;
  readonly executeMigration: (input: {
    readonly command: FlowDefinitionCommand;
    readonly prepare: (
      current: FlowDefinitionControlRecord,
      latestVersion: FlowDefinitionPublishedVersionRecord | null
    ) => FlowDefinitionPreparation<MigrateFlowDefinitionV2Response>;
  }) => Promise<FlowDefinitionCommandResult<MigrateFlowDefinitionV2Response>>;
};

export class FlowDefinitionRevisionConflictError extends Error {
  readonly code = "FLOW_DRAFT_REVISION_CONFLICT";

  constructor(
    readonly expectedRevision: number,
    readonly currentRevision: number
  ) {
    super("Flow draft was changed by another command");
    this.name = "FlowDefinitionRevisionConflictError";
  }
}

export class FlowDefinitionIdempotencyConflictError extends Error {
  readonly code = "FLOW_IDEMPOTENCY_KEY_REUSED";

  constructor() {
    super("Flow idempotency key was already used for another request");
    this.name = "FlowDefinitionIdempotencyConflictError";
  }
}

export class FlowDefinitionIdempotencyKeyInvalidError extends Error {
  readonly code = "FLOW_IDEMPOTENCY_KEY_INVALID";

  constructor() {
    super("Flow definition command requires a valid idempotency key");
    this.name = "FlowDefinitionIdempotencyKeyInvalidError";
  }
}

export class FlowDefinitionIdempotencyExpiredError extends Error {
  readonly code = "FLOW_IDEMPOTENCY_KEY_EXPIRED";

  constructor() {
    super("Flow idempotency replay window has expired and the key cannot be reused");
    this.name = "FlowDefinitionIdempotencyExpiredError";
  }
}

export class FlowDefinitionTemplateNotFoundError extends Error {
  readonly code = "FLOW_TEMPLATE_NOT_FOUND";

  constructor(readonly templateKey: string) {
    super("Flow template was not found");
    this.name = "FlowDefinitionTemplateNotFoundError";
  }
}

export class FlowDefinitionTemplateVersionConflictError extends Error {
  readonly code = "FLOW_TEMPLATE_VERSION_CONFLICT";

  constructor(
    readonly templateKey: string,
    readonly requestedVersion: number,
    readonly currentVersion: number
  ) {
    super("Requested flow template version is no longer current");
    this.name = "FlowDefinitionTemplateVersionConflictError";
  }
}

export class FlowDefinitionTemplateNotAvailableError extends Error {
  readonly code = "FLOW_TEMPLATE_NOT_AVAILABLE";

  constructor(
    readonly templateKey: string,
    readonly reasonCode: "FLOW_TEMPLATE_CAPABILITY_UNAVAILABLE" | "FLOW_TEMPLATE_LEGACY_GRAPH_ONLY"
  ) {
    super("Flow template is not available for creation");
    this.name = "FlowDefinitionTemplateNotAvailableError";
  }
}

export class FlowDefinitionTemplateParametersInvalidError extends Error {
  readonly code = "FLOW_TEMPLATE_PARAMETERS_INVALID";

  constructor(
    readonly templateKey: string,
    readonly parameterPaths: readonly string[]
  ) {
    super("Flow template parameters do not match the selected template version");
    this.name = "FlowDefinitionTemplateParametersInvalidError";
  }
}

export class FlowDefinitionGraphAlreadyV2Error extends Error {
  readonly code = "FLOW_GRAPH_ALREADY_V2";

  constructor() {
    super("Flow definition already uses graph V2");
    this.name = "FlowDefinitionGraphAlreadyV2Error";
  }
}

export class FlowDefinitionMigrationNotAllowedError extends Error {
  readonly code = "FLOW_DEFINITION_MIGRATION_NOT_ALLOWED";

  constructor(readonly state: FlowDefinitionState) {
    super("Flow definition cannot be migrated in its current state");
    this.name = "FlowDefinitionMigrationNotAllowedError";
  }
}

export class FlowDefinitionMigrationBlockedError extends Error {
  readonly code = "FLOW_GRAPH_MIGRATION_BLOCKED";

  constructor(
    readonly issues: readonly {
      readonly code: "unsupported_node" | "unsupported_edge" | "invalid_legacy_graph";
      readonly path: string;
      readonly message: string;
    }[]
  ) {
    super("Flow graph cannot be migrated without changing its semantics");
    this.name = "FlowDefinitionMigrationBlockedError";
  }
}

export class FlowDefinitionNotEditableError extends Error {
  readonly code = "FLOW_DRAFT_NOT_EDITABLE";

  constructor(readonly state: FlowDefinitionState) {
    super("Only an editable flow draft can be changed or published");
    this.name = "FlowDefinitionNotEditableError";
  }
}

export class FlowDefinitionNextDraftUnavailableError extends Error {
  readonly code = "FLOW_NEXT_DRAFT_NOT_AVAILABLE";

  constructor(readonly state: FlowDefinitionState) {
    super("A next draft can be created only from a versioned flow definition");
    this.name = "FlowDefinitionNextDraftUnavailableError";
  }
}

export class FlowDefinitionNextDraftBaseConflictError extends Error {
  readonly code = "FLOW_NEXT_DRAFT_BASE_CONFLICT";

  constructor(
    readonly expectedBaseVersionId: string,
    readonly currentBaseVersionId: string
  ) {
    super("Flow next-draft base version no longer matches the latest version");
    this.name = "FlowDefinitionNextDraftBaseConflictError";
  }
}

export class FlowDefinitionMigrationRequiredError extends Error {
  readonly code = "FLOW_GRAPH_MIGRATION_REQUIRED";

  constructor() {
    super("Flow graph v1 requires explicit migration before V2 commands");
    this.name = "FlowDefinitionMigrationRequiredError";
  }
}

export class FlowDefinitionDraftMutationInvalidError extends Error {
  readonly code = "FLOW_DRAFT_MUTATION_INVALID";

  constructor() {
    super("Flow draft mutation conflicts with the persisted graph or presentation");
    this.name = "FlowDefinitionDraftMutationInvalidError";
  }
}

export class FlowDefinitionIntegrityError extends Error {
  readonly code = "FLOW_DEFINITION_INTEGRITY_FAILURE";

  constructor() {
    super("Persisted flow definition or version violates its invariant");
    this.name = "FlowDefinitionIntegrityError";
  }
}

export function parseFlowDefinitionPublishedVersionRecord(input: {
  readonly id: string;
  readonly flowId: string;
  readonly version: number;
  readonly sourceRevision: number | null;
  readonly approvalMode: unknown;
  readonly graph: unknown;
  readonly presentation: unknown | null;
  readonly capabilityManifest: unknown | null;
  readonly publishedAt: string;
}): FlowDefinitionPublishedVersionRecord {
  const graph = flowGraphReadSchema.safeParse(input.graph);
  const approvalMode = flowApprovalModeSchema.safeParse(input.approvalMode);
  if (!graph.success || !approvalMode.success) throw new FlowDefinitionIntegrityError();

  if (graph.data.schemaVersion === "flow-graph.v1") {
    if (
      input.sourceRevision !== null ||
      input.presentation !== null ||
      input.capabilityManifest !== null
    ) {
      throw new FlowDefinitionIntegrityError();
    }
    const version = flowVersionSchema.safeParse({
      id: input.id,
      flowId: input.flowId,
      version: input.version,
      status: "published",
      approvalMode: approvalMode.data,
      graph: graph.data,
      publishedAt: input.publishedAt
    });
    if (!version.success) throw new FlowDefinitionIntegrityError();
    return {
      id: version.data.id,
      flowId: version.data.flowId,
      version: version.data.version,
      sourceRevision: null,
      approvalMode: version.data.approvalMode,
      graph: version.data.graph,
      presentation: null,
      capabilityManifest: null,
      publishedAt: version.data.publishedAt
    };
  }

  const manifest = flowCapabilityManifestSchema.safeParse(input.capabilityManifest);
  if (!manifest.success) throw new FlowDefinitionIntegrityError();
  const version = flowPublishedVersionCompatibleSchema.safeParse({
    schemaVersion:
      manifest.data.schemaVersion === "flow-capability-manifest.v1"
        ? "flow-published-version.v2"
        : "flow-published-version.v3",
    id: input.id,
    flowId: input.flowId,
    version: input.version,
    sourceRevision: input.sourceRevision,
    status: "published",
    approvalMode: approvalMode.data,
    graph: graph.data,
    presentation: input.presentation,
    capabilityManifest: manifest.data,
    publishedAt: input.publishedAt
  });
  if (!version.success) throw new FlowDefinitionIntegrityError();
  return {
    id: version.data.id,
    flowId: version.data.flowId,
    version: version.data.version,
    sourceRevision: version.data.sourceRevision,
    approvalMode: version.data.approvalMode,
    graph: version.data.graph,
    presentation: version.data.presentation,
    capabilityManifest: version.data.capabilityManifest,
    publishedAt: version.data.publishedAt
  };
}

export class FlowDefinitionPublishValidationError extends Error {
  readonly code = "FLOW_GRAPH_NOT_PUBLISHABLE";

  constructor(readonly issues: readonly FlowGraphV2CompileIssue[]) {
    super("Flow graph is not publishable");
    this.name = "FlowDefinitionPublishValidationError";
  }
}

export async function createFlowDefinitionV2(input: {
  readonly store: FlowDefinitionControlStore;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly request: CreateFlowDefinitionV2RequestInput;
  readonly idempotencyKey: string;
  readonly now: string;
}): Promise<FlowDefinitionV2> {
  const request = createFlowDefinitionV2RequestSchema.parse(input.request);
  const command = createCommand({
    routeTemplate: "/flows",
    scope: "flows.definition.create.v2",
    actorUserId: input.actorUserId,
    ownerUserId: input.ownerUserId,
    resourceId: input.ownerUserId,
    expectedRevision: null,
    idempotencyKey: input.idempotencyKey,
    request,
    now: input.now
  });
  const result = await input.store.executeCreate({
    command,
    prepare: () => prepareFlowDefinitionV2Creation(request)
  });
  const definition = resolveCommandOutcome(result.outcome, flowDefinitionV2Schema.parse, 201);
  if (
    definition.ownerUserId !== input.ownerUserId ||
    definition.name !== request.name ||
    definition.state !== "draft" ||
    definition.revision !== 1 ||
    definition.draftBaseVersionId !== null ||
    definition.latestPublishedVersionId !== null ||
    definition.latestPublishedVersion !== null ||
    (result.kind === "created" &&
      (definition.createdAt !== command.now || definition.updatedAt !== command.now)) ||
    definition.publishedAt !== null ||
    (request.source.type === "blank"
      ? definition.origin.type !== "blank"
      : definition.origin.type !== "template" ||
        definition.origin.templateKey !== request.source.templateKey ||
        definition.origin.templateVersion !== request.source.templateVersion)
  ) {
    throw new FlowDefinitionIntegrityError();
  }
  return definition;
}

export async function migrateFlowDefinitionV2(input: {
  readonly store: FlowDefinitionControlStore;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly request: MigrateFlowDefinitionV2Request;
  readonly idempotencyKey: string;
  readonly now: string;
}): Promise<MigrateFlowDefinitionV2Response | null> {
  const request = migrateFlowDefinitionV2RequestSchema.parse(input.request);
  const command = createCommand({
    routeTemplate: "/flows/:flowId/migrations/v2",
    scope: "flows.definition.migrate.v2",
    actorUserId: input.actorUserId,
    ownerUserId: input.ownerUserId,
    resourceId: input.flowId,
    expectedRevision: request.expectedRevision,
    idempotencyKey: input.idempotencyKey,
    request,
    now: input.now
  });
  const result = await input.store.executeMigration({
    command,
    prepare: (current, latestVersion) => {
      const prepared = prepareFlowDefinitionV1Migration({
        current,
        latestVersion,
        request,
        now: command.now
      });
      if (prepared.kind === "integrity_failure") throw new FlowDefinitionIntegrityError();
      return prepared;
    }
  });
  if (commandOutcomeIsNotFound(result.outcome)) return null;
  const migrated = resolveCommandOutcome(
    result.outcome,
    migrateFlowDefinitionV2ResponseSchema.parse,
    200
  );
  assertDefinitionCommandResponse(migrated.flow, input, request.expectedRevision, "draft");
  if (
    migrated.migration.sourceRevision !== request.expectedRevision ||
    (result.kind === "created" && migrated.migration.migratedAt !== command.now)
  ) {
    throw new FlowDefinitionIntegrityError();
  }
  return migrated;
}

export async function updateFlowDefinitionDraftV2(input: {
  readonly store: FlowDefinitionControlStore;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly request: UpdateFlowDefinitionDraftV2Request;
  readonly idempotencyKey: string;
  readonly now: string;
}): Promise<FlowDefinitionV2 | null> {
  const request = updateFlowDefinitionDraftV2RequestSchema.parse(input.request);
  const command = createCommand({
    routeTemplate: "/flows/:flowId/draft",
    scope: "flows.definition.update-draft.v2",
    actorUserId: input.actorUserId,
    ownerUserId: input.ownerUserId,
    resourceId: input.flowId,
    expectedRevision: request.expectedRevision,
    idempotencyKey: input.idempotencyKey,
    request,
    now: input.now
  });
  const result = await input.store.executeDraftUpdate({
    command,
    prepare: (current) => prepareDraftUpdate(current, request, command.now)
  });
  if (commandOutcomeIsNotFound(result.outcome)) return null;
  const definition = resolveCommandOutcome(result.outcome, flowDefinitionV2Schema.parse, 200);
  assertDefinitionCommandResponse(definition, input, request.expectedRevision, "draft");
  return definition;
}

export async function publishFlowDefinitionV2(input: {
  readonly store: FlowDefinitionControlStore;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly request: PublishFlowDefinitionV2Request;
  readonly idempotencyKey: string;
  readonly now: string;
  readonly responseVersion: FlowPublicationResponseVersion;
  readonly persistenceVersion: FlowPublicationPersistenceVersion;
}): Promise<PublishFlowDefinitionCompatibleResponse | null> {
  const request = publishFlowDefinitionV2RequestSchema.parse(input.request);
  if (input.responseVersion === "current_v3" && input.persistenceVersion !== "current_v2") {
    throw new FlowDefinitionIntegrityError();
  }
  const command = createCommand({
    routeTemplate: "/flows/:flowId/publish",
    scope: "flows.definition.publish.v2",
    actorUserId: input.actorUserId,
    ownerUserId: input.ownerUserId,
    resourceId: input.flowId,
    expectedRevision: request.expectedRevision,
    idempotencyKey: input.idempotencyKey,
    request,
    now: input.now
  });
  const assertCreatedResponse = (
    response: unknown
  ): PublishFlowDefinitionV2Response | PublishFlowDefinitionV3Response => {
    const published = (
      input.responseVersion === "current_v3"
        ? publishFlowDefinitionV3ResponseSchema
        : publishFlowDefinitionV2ResponseSchema
    ).safeParse(response);
    if (!published.success) throw new FlowDefinitionIntegrityError();
    assertDefinitionCommandResponse(
      published.data.flow,
      input,
      request.expectedRevision,
      "versioned"
    );
    if (
      published.data.version.sourceRevision !== request.expectedRevision ||
      !publishedVersionMatchesCompiler(published.data.version)
    ) {
      throw new FlowDefinitionIntegrityError();
    }
    return published.data;
  };
  const result = await input.store.executePublish({
    command,
    prepare: (current) => preparePublication(current, request.expectedRevision),
    responseVersion: input.responseVersion,
    persistenceVersion: input.persistenceVersion,
    assertCreatedResponse
  });
  if (commandOutcomeIsNotFound(result.outcome)) return null;
  const published = resolveCommandOutcome(
    result.outcome,
    publishFlowDefinitionCompatibleResponseSchema.parse,
    200
  );
  if (result.kind === "created") assertCreatedResponse(published);
  assertDefinitionCommandResponse(published.flow, input, request.expectedRevision, "versioned");
  if (
    published.version.sourceRevision !== request.expectedRevision ||
    !publishedVersionMatchesCompiler(published.version)
  ) {
    throw new FlowDefinitionIntegrityError();
  }
  return published;
}

export async function createNextFlowDraftV2(input: {
  readonly store: FlowDefinitionControlStore;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly request: CreateNextFlowDraftV2Request;
  readonly idempotencyKey: string;
  readonly now: string;
}): Promise<FlowDefinitionV2 | null> {
  const request = createNextFlowDraftV2RequestSchema.parse(input.request);
  const command = createCommand({
    routeTemplate: "/flows/:flowId/next-draft",
    scope: "flows.definition.create-next-draft.v2",
    actorUserId: input.actorUserId,
    ownerUserId: input.ownerUserId,
    resourceId: input.flowId,
    expectedRevision: request.expectedRevision,
    idempotencyKey: input.idempotencyKey,
    request,
    now: input.now
  });
  const result = await input.store.executeCreateNextDraft({
    command,
    prepare: (current, latestVersion) =>
      prepareNextDraft(current, latestVersion, request, command.now)
  });
  if (commandOutcomeIsNotFound(result.outcome)) return null;
  const definition = resolveCommandOutcome(result.outcome, flowDefinitionV2Schema.parse, 200);
  assertDefinitionCommandResponse(definition, input, request.expectedRevision, "draft");
  if (
    definition.draftBaseVersionId === null ||
    definition.draftBaseVersionId !== definition.latestPublishedVersionId
  ) {
    throw new FlowDefinitionIntegrityError();
  }
  return definition;
}

function prepareDraftUpdate(
  current: FlowDefinitionControlRecord,
  request: UpdateFlowDefinitionDraftV2Request,
  now: string
): FlowDefinitionPreparation<FlowDefinitionV2> {
  const editable = parseEditableDraft(current, request.expectedRevision);
  if (editable.kind === "rejected") return editable;

  const candidate = flowDefinitionV2Schema.safeParse({
    ...editable.value,
    name: request.name ?? editable.value.name,
    approvalMode: request.approvalMode ?? editable.value.approvalMode,
    revision: editable.value.revision + 1,
    draftGraph: request.graph ?? editable.value.draftGraph,
    draftPresentation:
      request.presentation === undefined ? editable.value.draftPresentation : request.presentation,
    updatedAt: now
  });
  if (!candidate.success) {
    return rejected(409, { code: "FLOW_DRAFT_MUTATION_INVALID" });
  }
  return accepted(candidate.data);
}

function preparePublication(
  current: FlowDefinitionControlRecord,
  expectedRevision: number
): FlowDefinitionPreparation<FlowDefinitionPreparedPublication> {
  const editable = parseEditableDraft(current, expectedRevision);
  if (editable.kind === "rejected") return editable;

  const compiled = compileFlowGraphV2(editable.value.draftGraph);
  if (
    !compiled.publishable ||
    compiled.normalizedGraph === null ||
    compiled.capabilityManifest === null
  ) {
    return rejected(422, {
      code: "FLOW_GRAPH_NOT_PUBLISHABLE",
      issues: compiled.issues
    });
  }

  return accepted({
    sourceRevision: editable.value.revision,
    approvalMode: editable.value.approvalMode,
    graph: compiled.normalizedGraph,
    presentation: editable.value.draftPresentation,
    capabilityManifest: compiled.capabilityManifest,
    legacyCapabilityManifest: projectFlowCapabilityManifestV1(compiled.capabilityManifest)
  });
}

function prepareNextDraft(
  current: FlowDefinitionControlRecord,
  latestVersion: FlowDefinitionPublishedVersionRecord | null,
  request: CreateNextFlowDraftV2Request,
  now: string
): FlowDefinitionPreparation<FlowDefinitionV2> {
  if (current.draftGraph.schemaVersion === "flow-graph.v1") {
    return rejected(409, { code: "FLOW_GRAPH_MIGRATION_REQUIRED" });
  }
  const definition = parsePersistedDefinition(current);
  if (definition.kind === "rejected") return definition;
  const revisionConflict = checkRevision(definition.value, request.expectedRevision);
  if (revisionConflict) return revisionConflict;
  if (definition.value.state !== "versioned") {
    return rejected(409, {
      code: "FLOW_NEXT_DRAFT_NOT_AVAILABLE",
      state: definition.value.state
    });
  }
  if (!latestVersion) throw new FlowDefinitionIntegrityError();
  if (latestVersion.graph.schemaVersion === "flow-graph.v1") {
    return rejected(409, { code: "FLOW_GRAPH_MIGRATION_REQUIRED" });
  }
  if (request.baseVersionId !== latestVersion.id) {
    return rejected(409, {
      code: "FLOW_NEXT_DRAFT_BASE_CONFLICT",
      expectedBaseVersionId: request.baseVersionId,
      currentBaseVersionId: latestVersion.id
    });
  }
  const version = flowPublishedVersionCompatibleSchema.safeParse({
    schemaVersion:
      latestVersion.capabilityManifest?.schemaVersion === "flow-capability-manifest.v1"
        ? "flow-published-version.v2"
        : "flow-published-version.v3",
    ...latestVersion,
    status: "published"
  });
  if (
    !version.success ||
    definition.value.latestPublishedVersionId !== version.data.id ||
    definition.value.latestPublishedVersion !== version.data.version ||
    definition.value.publishedAt !== version.data.publishedAt ||
    !publishedVersionMatchesCompiler(version.data)
  ) {
    throw new FlowDefinitionIntegrityError();
  }

  const next = flowDefinitionV2Schema.safeParse({
    ...definition.value,
    state: "draft",
    approvalMode: version.data.approvalMode,
    revision: definition.value.revision + 1,
    draftBaseVersionId: version.data.id,
    draftGraph: version.data.graph,
    draftPresentation: version.data.presentation,
    updatedAt: now
  });
  if (!next.success) throw new FlowDefinitionIntegrityError();
  return accepted(next.data);
}

function parseEditableDraft(
  current: FlowDefinitionControlRecord,
  expectedRevision: number
): FlowDefinitionPreparation<FlowDefinitionV2> {
  if (current.draftGraph.schemaVersion === "flow-graph.v1") {
    return rejected(409, { code: "FLOW_GRAPH_MIGRATION_REQUIRED" });
  }
  const definition = parsePersistedDefinition(current);
  if (definition.kind === "rejected") return definition;
  const revisionConflict = checkRevision(definition.value, expectedRevision);
  if (revisionConflict) return revisionConflict;
  if (definition.value.state !== "draft") {
    return rejected(409, {
      code: "FLOW_DRAFT_NOT_EDITABLE",
      state: definition.value.state
    });
  }
  return definition;
}

function parsePersistedDefinition(
  current: FlowDefinitionControlRecord
): FlowDefinitionPreparation<FlowDefinitionV2> {
  const definition = flowDefinitionV2Schema.safeParse({
    schemaVersion: "flow-definition.v2",
    ...current
  });
  if (!definition.success) throw new FlowDefinitionIntegrityError();
  return accepted(definition.data);
}

function checkRevision(
  current: FlowDefinitionControlRecord,
  expectedRevision: number
): FlowDefinitionPreparation<never> | null {
  return current.revision === expectedRevision
    ? null
    : rejected(409, {
        code: "FLOW_DRAFT_REVISION_CONFLICT",
        expectedRevision,
        currentRevision: current.revision
      });
}

function accepted<T>(value: T): FlowDefinitionPreparation<T> {
  return { kind: "accepted", value };
}

function rejected(
  statusCode: FlowDefinitionCommandRejectionResponse["statusCode"],
  body: FlowDefinitionCommandRejection
): FlowDefinitionPreparation<never> {
  return { kind: "rejected", response: { statusCode, body } };
}

function resolveCommandOutcome<T>(
  outcome: FlowDefinitionCommandOutcome<unknown>,
  parse: (value: unknown) => T,
  expectedStatus: 200 | 201
): T {
  if (outcome.kind === "rejected") throw rejectionToError(outcome.response.body);
  if (outcome.response.statusCode !== expectedStatus) {
    throw new FlowDefinitionIntegrityError();
  }
  try {
    return parse(outcome.response.body);
  } catch {
    throw new FlowDefinitionIntegrityError();
  }
}

function commandOutcomeIsNotFound(outcome: FlowDefinitionCommandOutcome<unknown>): boolean {
  return outcome.kind === "rejected" && outcome.response.body.code === "FLOW_DEFINITION_NOT_FOUND";
}

function rejectionToError(rejection: FlowDefinitionCommandRejection): Error {
  switch (rejection.code) {
    case "FLOW_DEFINITION_NOT_FOUND":
      return new FlowDefinitionIntegrityError();
    case "FLOW_TEMPLATE_NOT_FOUND":
      return new FlowDefinitionTemplateNotFoundError(rejection.templateKey);
    case "FLOW_DRAFT_REVISION_CONFLICT":
      return new FlowDefinitionRevisionConflictError(
        rejection.expectedRevision,
        rejection.currentRevision
      );
    case "FLOW_DRAFT_NOT_EDITABLE":
      return new FlowDefinitionNotEditableError(rejection.state);
    case "FLOW_NEXT_DRAFT_NOT_AVAILABLE":
      return new FlowDefinitionNextDraftUnavailableError(rejection.state);
    case "FLOW_NEXT_DRAFT_BASE_CONFLICT":
      return new FlowDefinitionNextDraftBaseConflictError(
        rejection.expectedBaseVersionId,
        rejection.currentBaseVersionId
      );
    case "FLOW_GRAPH_MIGRATION_REQUIRED":
      return new FlowDefinitionMigrationRequiredError();
    case "FLOW_GRAPH_ALREADY_V2":
      return new FlowDefinitionGraphAlreadyV2Error();
    case "FLOW_DEFINITION_MIGRATION_NOT_ALLOWED":
      return new FlowDefinitionMigrationNotAllowedError(rejection.state);
    case "FLOW_IDEMPOTENCY_KEY_INVALID":
      return new FlowDefinitionIdempotencyKeyInvalidError();
    case "FLOW_IDEMPOTENCY_KEY_REUSED":
      return new FlowDefinitionIdempotencyConflictError();
    case "FLOW_IDEMPOTENCY_KEY_EXPIRED":
      return new FlowDefinitionIdempotencyExpiredError();
    case "FLOW_TEMPLATE_VERSION_CONFLICT":
      return new FlowDefinitionTemplateVersionConflictError(
        rejection.templateKey,
        rejection.requestedVersion,
        rejection.currentVersion
      );
    case "FLOW_TEMPLATE_NOT_AVAILABLE":
      return new FlowDefinitionTemplateNotAvailableError(
        rejection.templateKey,
        rejection.reasonCode
      );
    case "FLOW_TEMPLATE_PARAMETERS_INVALID":
      return new FlowDefinitionTemplateParametersInvalidError(
        rejection.templateKey,
        rejection.parameterPaths
      );
    case "FLOW_GRAPH_MIGRATION_BLOCKED":
      return new FlowDefinitionMigrationBlockedError(rejection.issues);
    case "FLOW_DRAFT_MUTATION_INVALID":
      return new FlowDefinitionDraftMutationInvalidError();
    case "FLOW_GRAPH_NOT_PUBLISHABLE":
      return new FlowDefinitionPublishValidationError(rejection.issues);
  }
}

function assertDefinitionCommandResponse(
  definition: FlowDefinitionV2,
  input: { readonly ownerUserId: string; readonly flowId: string },
  expectedRevision: number,
  expectedState: FlowDefinitionState
): void {
  if (
    definition.id !== input.flowId ||
    definition.ownerUserId !== input.ownerUserId ||
    definition.revision !== expectedRevision + 1 ||
    definition.state !== expectedState
  ) {
    throw new FlowDefinitionIntegrityError();
  }
}

function publishedVersionMatchesCompiler(version: FlowPublishedVersionCompatible): boolean {
  const compiled = compileFlowGraphV2(version.graph);
  const manifestIntegrity = verifyFlowCapabilityManifestForGraph({
    graph: version.graph,
    capabilityManifest: version.capabilityManifest
  });
  return Boolean(
    compiled.publishable &&
    compiled.normalizedGraph &&
    manifestIntegrity.valid &&
    stableJson(compiled.normalizedGraph as unknown as CanonicalJson) ===
      stableJson(version.graph as unknown as CanonicalJson)
  );
}

function createCommand(input: {
  readonly routeTemplate: FlowDefinitionRouteTemplate;
  readonly scope: FlowDefinitionCommandScope;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly resourceId: string;
  readonly expectedRevision: number | null;
  readonly idempotencyKey: string;
  readonly request:
    | CreateFlowDefinitionV2Request
    | UpdateFlowDefinitionDraftV2Request
    | PublishFlowDefinitionV2Request
    | CreateNextFlowDraftV2Request
    | MigrateFlowDefinitionV2Request;
  readonly now: string;
}): FlowDefinitionCommand {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const nowDate = new Date(input.now);
  if (!Number.isFinite(nowDate.getTime())) {
    throw new TypeError("Flow definition command time must be a valid instant");
  }
  const now = nowDate.toISOString();
  return {
    apiSurface: "astrologer-api",
    routeTemplate: input.routeTemplate,
    scope: input.scope,
    actorUserId: input.actorUserId,
    ownerUserId: input.ownerUserId,
    resourceId: input.resourceId,
    expectedRevision: input.expectedRevision,
    idempotencyKey,
    requestHash: sha256CanonicalJson({
      schemaVersion: "flow-definition-command.v1",
      apiSurface: "astrologer-api",
      routeTemplate: input.routeTemplate,
      scope: input.scope,
      actorUserId: input.actorUserId,
      ownerUserId: input.ownerUserId,
      resourceId: input.resourceId,
      request: input.request as unknown as CanonicalJson
    }),
    now
  };
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new FlowDefinitionIdempotencyKeyInvalidError();
  }
  return normalized;
}
