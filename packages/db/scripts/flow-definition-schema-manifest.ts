export type CatalogDefinitionManifest = Readonly<Record<string, string>>;

export const predecessorFlowColumnSignatures = [
  "flow_versions.approval_mode|text|NO|",
  "flow_versions.flow_id|uuid|NO|",
  "flow_versions.graph|jsonb|NO|",
  "flow_versions.id|uuid|NO|gen_random_uuid()",
  "flow_versions.owner_user_id|uuid|NO|",
  "flow_versions.published_at|timestamptz|NO|",
  "flow_versions.version|int4|NO|",
  "flows.approval_mode|text|NO|'manual_approve'::text",
  "flows.created_at|timestamptz|NO|now()",
  "flows.draft_graph|jsonb|NO|",
  "flows.id|uuid|NO|gen_random_uuid()",
  "flows.name|text|NO|",
  "flows.owner_user_id|uuid|NO|",
  "flows.published_at|timestamptz|YES|",
  "flows.published_version_id|uuid|YES|",
  "flows.status|text|NO|'draft'::text",
  "flows.updated_at|timestamptz|NO|now()"
] as const;

export const canonicalFlowColumnSignatures = [
  "flow_definition_command_outcomes.command_id|uuid|NO|",
  "flow_definition_command_outcomes.created_at|timestamptz|NO|now()",
  "flow_definition_command_outcomes.response_body|jsonb|NO|",
  "flow_definition_command_outcomes.response_status|int4|NO|",
  "flow_definition_commands.actor_user_id|uuid|NO|",
  "flow_definition_commands.api_surface|text|NO|",
  "flow_definition_commands.command_scope|text|NO|",
  "flow_definition_commands.completed_at|timestamptz|YES|",
  "flow_definition_commands.created_at|timestamptz|NO|now()",
  "flow_definition_commands.id|uuid|NO|gen_random_uuid()",
  "flow_definition_commands.idempotency_key|text|NO|",
  "flow_definition_commands.owner_user_id|uuid|NO|",
  "flow_definition_commands.replay_until|timestamptz|NO|",
  "flow_definition_commands.request_hash|text|NO|",
  "flow_definition_commands.resource_id|uuid|NO|",
  "flow_definition_commands.route_template|text|NO|",
  "flow_definition_commands.state|text|NO|'processing'::text",
  "flow_definition_commands.updated_at|timestamptz|NO|now()",
  "flow_definition_migrations.command_id|uuid|NO|",
  "flow_definition_migrations.flow_id|uuid|NO|",
  "flow_definition_migrations.id|uuid|NO|gen_random_uuid()",
  "flow_definition_migrations.migrated_at|timestamptz|NO|",
  "flow_definition_migrations.owner_user_id|uuid|NO|",
  "flow_definition_migrations.source_graph_hash|text|NO|",
  "flow_definition_migrations.source_graph_schema_version|text|NO|",
  "flow_definition_migrations.source_revision|int4|NO|",
  "flow_definition_migrations.source_version_id|uuid|YES|",
  "flow_definition_migrations.target_graph_schema_version|text|NO|",
  "flow_definition_migrations.target_revision|int4|NO|",
  "flow_versions.approval_mode|text|NO|",
  "flow_versions.capability_manifest|jsonb|YES|",
  "flow_versions.flow_id|uuid|NO|",
  "flow_versions.graph|jsonb|NO|",
  "flow_versions.graph_schema_version|text|YES|",
  "flow_versions.id|uuid|NO|gen_random_uuid()",
  "flow_versions.owner_user_id|uuid|NO|",
  "flow_versions.presentation|jsonb|YES|",
  "flow_versions.published_at|timestamptz|NO|",
  "flow_versions.source_revision|int4|YES|",
  "flow_versions.version|int4|NO|",
  "flows.approval_mode|text|NO|'manual_approve'::text",
  "flows.created_at|timestamptz|NO|now()",
  "flows.definition_state|text|NO|'draft'::text",
  "flows.draft_base_version_id|uuid|YES|",
  "flows.draft_graph|jsonb|NO|",
  "flows.draft_presentation|jsonb|YES|",
  "flows.id|uuid|NO|gen_random_uuid()",
  "flows.name|text|NO|",
  "flows.origin|jsonb|YES|",
  "flows.owner_user_id|uuid|NO|",
  "flows.published_at|timestamptz|YES|",
  "flows.published_version_id|uuid|YES|",
  "flows.revision|int4|NO|1",
  "flows.status|text|NO|'draft'::text",
  "flows.updated_at|timestamptz|NO|now()"
] as const;

export const predecessorFlowConstraints: CatalogDefinitionManifest = {
  "flow_versions.flow_versions_approval_mode_check":
    "CHECK ((approval_mode = ANY (ARRAY['draft_only'::text, 'manual_approve'::text, 'auto_internal'::text, 'auto_send'::text])))",
  "flow_versions.flow_versions_flow_id_id_owner_unique": "UNIQUE (flow_id, id, owner_user_id)",
  "flow_versions.flow_versions_flow_owner_fk":
    "FOREIGN KEY (flow_id, owner_user_id) REFERENCES flows(id, owner_user_id) ON DELETE CASCADE",
  "flow_versions.flow_versions_graph_object_check":
    "CHECK ((jsonb_typeof(graph) = 'object'::text))",
  "flow_versions.flow_versions_id_owner_unique": "UNIQUE (id, owner_user_id)",
  "flow_versions.flow_versions_owner_user_id_users_id_fk":
    "FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE",
  "flow_versions.flow_versions_pkey": "PRIMARY KEY (id)",
  "flow_versions.flow_versions_positive_version_check": "CHECK ((version > 0))",
  "flows.flows_approval_mode_check":
    "CHECK ((approval_mode = ANY (ARRAY['draft_only'::text, 'manual_approve'::text, 'auto_internal'::text, 'auto_send'::text])))",
  "flows.flows_draft_graph_object_check": "CHECK ((jsonb_typeof(draft_graph) = 'object'::text))",
  "flows.flows_id_owner_unique": "UNIQUE (id, owner_user_id)",
  "flows.flows_name_length_check":
    "CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 180)))",
  "flows.flows_owner_user_id_users_id_fk":
    "FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE",
  "flows.flows_pkey": "PRIMARY KEY (id)",
  "flows.flows_published_version_owner_fk":
    "FOREIGN KEY (id, published_version_id, owner_user_id) REFERENCES flow_versions(flow_id, id, owner_user_id) ON DELETE RESTRICT",
  "flows.flows_status_check":
    "CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'active'::text, 'paused'::text, 'archived'::text])))"
};

export const canonicalFlowConstraints: CatalogDefinitionManifest = {
  "flow_definition_command_outcomes.flow_definition_command_outcomes_command_fk":
    "FOREIGN KEY (command_id) REFERENCES flow_definition_commands(id) ON DELETE CASCADE",
  "flow_definition_command_outcomes.flow_definition_command_outcomes_pkey":
    "PRIMARY KEY (command_id)",
  "flow_definition_command_outcomes.flow_definition_command_outcomes_response_check":
    "CHECK ((((response_status = ANY (ARRAY[200, 201])) OR ((response_status >= 400) AND (response_status <= 499))) AND (jsonb_typeof(response_body) = 'object'::text)))",
  "flow_definition_commands.flow_definition_commands_actor_user_id_users_id_fk":
    "FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE",
  "flow_definition_commands.flow_definition_commands_completion_check":
    "CHECK (((completed_at IS NULL) OR (completed_at >= created_at)))",
  "flow_definition_commands.flow_definition_commands_id_resource_owner_unique":
    "UNIQUE (id, resource_id, owner_user_id)",
  "flow_definition_commands.flow_definition_commands_key_check":
    "CHECK ((((length(idempotency_key) >= 8) AND (length(idempotency_key) <= 128)) AND (idempotency_key ~ '^[A-Za-z0-9._:-]+$'::text)))",
  "flow_definition_commands.flow_definition_commands_owner_user_id_users_id_fk":
    "FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE",
  "flow_definition_commands.flow_definition_commands_pkey": "PRIMARY KEY (id)",
  "flow_definition_commands.flow_definition_commands_replay_window_check":
    "CHECK ((replay_until = (created_at + '24:00:00'::interval)))",
  "flow_definition_commands.flow_definition_commands_request_hash_check":
    "CHECK ((request_hash ~ '^sha256:[a-f0-9]{64}$'::text))",
  "flow_definition_commands.flow_definition_commands_scope_check":
    "CHECK (((api_surface = 'astrologer-api'::text) AND (command_scope = ANY (ARRAY['flows.definition.create.v2'::text, 'flows.definition.update-draft.v2'::text, 'flows.definition.publish.v2'::text, 'flows.definition.create-next-draft.v2'::text, 'flows.definition.migrate.v2'::text])) AND (((route_template = '/flows'::text) AND (command_scope = 'flows.definition.create.v2'::text) AND (resource_id = owner_user_id)) OR ((route_template = '/flows/:flowId/draft'::text) AND (command_scope = 'flows.definition.update-draft.v2'::text)) OR ((route_template = '/flows/:flowId/publish'::text) AND (command_scope = 'flows.definition.publish.v2'::text)) OR ((route_template = '/flows/:flowId/next-draft'::text) AND (command_scope = 'flows.definition.create-next-draft.v2'::text)) OR ((route_template = '/flows/:flowId/migrations/v2'::text) AND (command_scope = 'flows.definition.migrate.v2'::text)))))",
  "flow_definition_commands.flow_definition_commands_state_check":
    "CHECK ((state = ANY (ARRAY['processing'::text, 'succeeded'::text, 'failed'::text])))",
  "flow_definition_commands.flow_definition_commands_terminal_state_check":
    "CHECK ((((state = 'processing'::text) AND (completed_at IS NULL)) OR ((state = ANY (ARRAY['succeeded'::text, 'failed'::text])) AND (completed_at IS NOT NULL))))",
  "flow_definition_migrations.flow_definition_migrations_command_resource_owner_fk":
    "FOREIGN KEY (command_id, flow_id, owner_user_id) REFERENCES flow_definition_commands(id, resource_id, owner_user_id) ON DELETE CASCADE",
  "flow_definition_migrations.flow_definition_migrations_flow_owner_fk":
    "FOREIGN KEY (flow_id, owner_user_id) REFERENCES flows(id, owner_user_id) ON DELETE CASCADE",
  "flow_definition_migrations.flow_definition_migrations_graph_hash_check":
    "CHECK ((source_graph_hash ~ '^sha256:[a-f0-9]{64}$'::text))",
  "flow_definition_migrations.flow_definition_migrations_pkey": "PRIMARY KEY (id)",
  "flow_definition_migrations.flow_definition_migrations_revision_check":
    "CHECK (((source_revision > 0) AND (target_revision = (source_revision + 1))))",
  "flow_definition_migrations.flow_definition_migrations_schema_versions_check":
    "CHECK (((source_graph_schema_version = 'flow-graph.v1'::text) AND (target_graph_schema_version = 'flow-graph.v2'::text)))",
  "flow_definition_migrations.flow_definition_migrations_source_version_owner_fk":
    "FOREIGN KEY (flow_id, source_version_id, owner_user_id) REFERENCES flow_versions(flow_id, id, owner_user_id) ON DELETE CASCADE",
  "flow_versions.flow_versions_approval_mode_check":
    "CHECK ((approval_mode = ANY (ARRAY['draft_only'::text, 'manual_approve'::text, 'auto_internal'::text, 'auto_send'::text])))",
  "flow_versions.flow_versions_flow_id_id_owner_published_unique":
    "UNIQUE (flow_id, id, owner_user_id, published_at)",
  "flow_versions.flow_versions_flow_id_id_owner_unique": "UNIQUE (flow_id, id, owner_user_id)",
  "flow_versions.flow_versions_flow_owner_fk":
    "FOREIGN KEY (flow_id, owner_user_id) REFERENCES flows(id, owner_user_id) ON DELETE CASCADE",
  "flow_versions.flow_versions_graph_object_check":
    "CHECK ((jsonb_typeof(graph) = 'object'::text))",
  "flow_versions.flow_versions_id_owner_unique": "UNIQUE (id, owner_user_id)",
  "flow_versions.flow_versions_owner_user_id_users_id_fk":
    "FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE",
  "flow_versions.flow_versions_pkey": "PRIMARY KEY (id)",
  "flow_versions.flow_versions_positive_version_check": "CHECK ((version > 0))",
  "flow_versions.flow_versions_presentation_object_check":
    "CHECK (((presentation IS NULL) OR (jsonb_typeof(presentation) = 'object'::text)))",
  "flow_versions.flow_versions_source_revision_check":
    "CHECK (((source_revision IS NULL) OR (source_revision > 0)))",
  "flow_versions.flow_versions_v2_metadata_check":
    "CHECK ((((source_revision IS NULL) AND (graph_schema_version IS NULL) AND (capability_manifest IS NULL)) OR ((source_revision > 0) AND (graph_schema_version = 'flow-graph.v2'::text) AND ((graph ->> 'schemaVersion'::text) = 'flow-graph.v2'::text) AND (jsonb_typeof(capability_manifest) = 'object'::text))))",
  "flows.flows_approval_mode_check":
    "CHECK ((approval_mode = ANY (ARRAY['draft_only'::text, 'manual_approve'::text, 'auto_internal'::text, 'auto_send'::text])))",
  "flows.flows_definition_lifecycle_check":
    "CHECK ((((definition_state = 'draft'::text) AND (((published_version_id IS NULL) AND (published_at IS NULL) AND (draft_base_version_id IS NULL)) OR ((published_version_id IS NOT NULL) AND (published_at IS NOT NULL) AND (draft_base_version_id = published_version_id)))) OR ((definition_state = 'versioned'::text) AND (published_version_id IS NOT NULL) AND (published_at IS NOT NULL) AND (draft_base_version_id IS NULL)) OR ((definition_state = 'archived'::text) AND (((published_version_id IS NULL) AND (published_at IS NULL) AND (draft_base_version_id IS NULL)) OR ((published_version_id IS NOT NULL) AND (published_at IS NOT NULL) AND ((draft_base_version_id IS NULL) OR (draft_base_version_id = published_version_id)))))))",
  "flows.flows_definition_state_check":
    "CHECK ((definition_state = ANY (ARRAY['draft'::text, 'versioned'::text, 'archived'::text])))",
  "flows.flows_draft_base_version_owner_fk":
    "FOREIGN KEY (id, draft_base_version_id, owner_user_id) REFERENCES flow_versions(flow_id, id, owner_user_id) ON DELETE RESTRICT",
  "flows.flows_draft_graph_object_check": "CHECK ((jsonb_typeof(draft_graph) = 'object'::text))",
  "flows.flows_draft_presentation_object_check":
    "CHECK (((draft_presentation IS NULL) OR (jsonb_typeof(draft_presentation) = 'object'::text)))",
  "flows.flows_graph_origin_check":
    "CHECK (((((draft_graph ->> 'schemaVersion'::text) = 'flow-graph.v1'::text) AND (origin IS NULL) AND (draft_presentation IS NULL)) OR (((draft_graph ->> 'schemaVersion'::text) = 'flow-graph.v2'::text) AND (jsonb_typeof(origin) = 'object'::text) AND ((origin ->> 'schemaVersion'::text) = 'flow-definition-origin.v1'::text) AND ((origin ->> 'type'::text) = ANY (ARRAY['blank'::text, 'template'::text, 'migration'::text])))))",
  "flows.flows_id_owner_unique": "UNIQUE (id, owner_user_id)",
  "flows.flows_name_length_check":
    "CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 180)))",
  "flows.flows_owner_user_id_users_id_fk":
    "FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE",
  "flows.flows_pkey": "PRIMARY KEY (id)",
  "flows.flows_published_version_owner_fk":
    "FOREIGN KEY (id, published_version_id, owner_user_id, published_at) REFERENCES flow_versions(flow_id, id, owner_user_id, published_at) ON DELETE RESTRICT",
  "flows.flows_revision_check": "CHECK ((revision > 0))",
  "flows.flows_status_check":
    "CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'active'::text, 'paused'::text, 'archived'::text])))"
};

export const predecessorFlowIndexes: CatalogDefinitionManifest = {
  "flow_versions.flow_versions_flow_id_id_owner_unique":
    "CREATE UNIQUE INDEX flow_versions_flow_id_id_owner_unique ON public.flow_versions USING btree (flow_id, id, owner_user_id)",
  "flow_versions.flow_versions_flow_version_unique":
    "CREATE UNIQUE INDEX flow_versions_flow_version_unique ON public.flow_versions USING btree (flow_id, version)",
  "flow_versions.flow_versions_id_owner_unique":
    "CREATE UNIQUE INDEX flow_versions_id_owner_unique ON public.flow_versions USING btree (id, owner_user_id)",
  "flow_versions.flow_versions_owner_published_idx":
    "CREATE INDEX flow_versions_owner_published_idx ON public.flow_versions USING btree (owner_user_id, published_at)",
  "flow_versions.flow_versions_pkey":
    "CREATE UNIQUE INDEX flow_versions_pkey ON public.flow_versions USING btree (id)",
  "flows.flows_id_owner_unique":
    "CREATE UNIQUE INDEX flows_id_owner_unique ON public.flows USING btree (id, owner_user_id)",
  "flows.flows_owner_name_idx":
    "CREATE INDEX flows_owner_name_idx ON public.flows USING btree (owner_user_id, name)",
  "flows.flows_owner_status_updated_idx":
    "CREATE INDEX flows_owner_status_updated_idx ON public.flows USING btree (owner_user_id, status, updated_at)",
  "flows.flows_pkey": "CREATE UNIQUE INDEX flows_pkey ON public.flows USING btree (id)"
};

export const canonicalFlowIndexes: CatalogDefinitionManifest = {
  "flow_definition_command_outcomes.flow_definition_command_outcomes_created_idx":
    "CREATE INDEX flow_definition_command_outcomes_created_idx ON public.flow_definition_command_outcomes USING btree (created_at)",
  "flow_definition_command_outcomes.flow_definition_command_outcomes_pkey":
    "CREATE UNIQUE INDEX flow_definition_command_outcomes_pkey ON public.flow_definition_command_outcomes USING btree (command_id)",
  "flow_definition_commands.flow_definition_commands_id_resource_owner_unique":
    "CREATE UNIQUE INDEX flow_definition_commands_id_resource_owner_unique ON public.flow_definition_commands USING btree (id, resource_id, owner_user_id)",
  "flow_definition_commands.flow_definition_commands_owner_resource_created_idx":
    "CREATE INDEX flow_definition_commands_owner_resource_created_idx ON public.flow_definition_commands USING btree (owner_user_id, resource_id, created_at)",
  "flow_definition_commands.flow_definition_commands_pkey":
    "CREATE UNIQUE INDEX flow_definition_commands_pkey ON public.flow_definition_commands USING btree (id)",
  "flow_definition_commands.flow_definition_commands_replay_until_idx":
    "CREATE INDEX flow_definition_commands_replay_until_idx ON public.flow_definition_commands USING btree (replay_until)",
  "flow_definition_commands.flow_definition_commands_scope_key_unique":
    "CREATE UNIQUE INDEX flow_definition_commands_scope_key_unique ON public.flow_definition_commands USING btree (api_surface, actor_user_id, owner_user_id, route_template, resource_id, idempotency_key)",
  "flow_definition_migrations.flow_definition_migrations_command_unique":
    "CREATE UNIQUE INDEX flow_definition_migrations_command_unique ON public.flow_definition_migrations USING btree (command_id)",
  "flow_definition_migrations.flow_definition_migrations_flow_target_revision_unique":
    "CREATE UNIQUE INDEX flow_definition_migrations_flow_target_revision_unique ON public.flow_definition_migrations USING btree (flow_id, target_revision)",
  "flow_definition_migrations.flow_definition_migrations_owner_migrated_idx":
    "CREATE INDEX flow_definition_migrations_owner_migrated_idx ON public.flow_definition_migrations USING btree (owner_user_id, migrated_at)",
  "flow_definition_migrations.flow_definition_migrations_pkey":
    "CREATE UNIQUE INDEX flow_definition_migrations_pkey ON public.flow_definition_migrations USING btree (id)",
  "flow_versions.flow_versions_flow_id_id_owner_published_unique":
    "CREATE UNIQUE INDEX flow_versions_flow_id_id_owner_published_unique ON public.flow_versions USING btree (flow_id, id, owner_user_id, published_at)",
  "flow_versions.flow_versions_flow_id_id_owner_unique":
    "CREATE UNIQUE INDEX flow_versions_flow_id_id_owner_unique ON public.flow_versions USING btree (flow_id, id, owner_user_id)",
  "flow_versions.flow_versions_flow_source_revision_unique":
    "CREATE UNIQUE INDEX flow_versions_flow_source_revision_unique ON public.flow_versions USING btree (flow_id, source_revision) WHERE (source_revision IS NOT NULL)",
  "flow_versions.flow_versions_flow_version_unique":
    "CREATE UNIQUE INDEX flow_versions_flow_version_unique ON public.flow_versions USING btree (flow_id, version)",
  "flow_versions.flow_versions_id_owner_unique":
    "CREATE UNIQUE INDEX flow_versions_id_owner_unique ON public.flow_versions USING btree (id, owner_user_id)",
  "flow_versions.flow_versions_owner_published_idx":
    "CREATE INDEX flow_versions_owner_published_idx ON public.flow_versions USING btree (owner_user_id, published_at)",
  "flow_versions.flow_versions_pkey":
    "CREATE UNIQUE INDEX flow_versions_pkey ON public.flow_versions USING btree (id)",
  "flows.flows_id_owner_unique":
    "CREATE UNIQUE INDEX flows_id_owner_unique ON public.flows USING btree (id, owner_user_id)",
  "flows.flows_owner_name_idx":
    "CREATE INDEX flows_owner_name_idx ON public.flows USING btree (owner_user_id, name)",
  "flows.flows_owner_definition_state_updated_idx":
    "CREATE INDEX flows_owner_definition_state_updated_idx ON public.flows USING btree (owner_user_id, definition_state, updated_at, id)",
  "flows.flows_owner_status_updated_idx":
    "CREATE INDEX flows_owner_status_updated_idx ON public.flows USING btree (owner_user_id, status, updated_at)",
  "flows.flows_pkey": "CREATE UNIQUE INDEX flows_pkey ON public.flows USING btree (id)"
};

export const previousCanonicalFlowIndexes: CatalogDefinitionManifest = Object.fromEntries(
  Object.entries(canonicalFlowIndexes).filter(
    ([key]) => key !== "flows.flows_owner_definition_state_updated_idx"
  )
);

export const canonicalFlowTriggers: CatalogDefinitionManifest = {
  "flow_definition_command_outcomes.flow_definition_command_outcomes_retention":
    "CREATE TRIGGER flow_definition_command_outcomes_retention BEFORE DELETE OR UPDATE ON public.flow_definition_command_outcomes FOR EACH ROW EXECUTE FUNCTION elevenhouse_guard_flow_definition_outcome_mutation()",
  "flow_definition_command_outcomes.flow_definition_outcome_command_consistency":
    "CREATE CONSTRAINT TRIGGER flow_definition_outcome_command_consistency AFTER INSERT OR DELETE OR UPDATE ON public.flow_definition_command_outcomes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION elevenhouse_assert_flow_definition_command_outcome()",
  "flow_definition_commands.flow_definition_command_outcome_consistency":
    "CREATE CONSTRAINT TRIGGER flow_definition_command_outcome_consistency AFTER INSERT OR DELETE OR UPDATE ON public.flow_definition_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION elevenhouse_assert_flow_definition_command_outcome()",
  "flow_definition_commands.flow_definition_commands_immutable_identity":
    "CREATE TRIGGER flow_definition_commands_immutable_identity BEFORE DELETE OR UPDATE ON public.flow_definition_commands FOR EACH ROW EXECUTE FUNCTION elevenhouse_guard_flow_definition_command_mutation()",
  "flow_definition_migrations.flow_definition_migrations_immutable":
    "CREATE TRIGGER flow_definition_migrations_immutable BEFORE DELETE OR UPDATE ON public.flow_definition_migrations FOR EACH ROW EXECUTE FUNCTION elevenhouse_guard_flow_definition_migration_mutation()",
  "flow_versions.flow_version_pointer_consistency":
    "CREATE CONSTRAINT TRIGGER flow_version_pointer_consistency AFTER INSERT OR DELETE ON public.flow_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION elevenhouse_assert_flow_publication_pointer()",
  "flow_versions.flow_versions_delete_with_aggregate_only":
    "CREATE TRIGGER flow_versions_delete_with_aggregate_only BEFORE DELETE ON public.flow_versions FOR EACH ROW EXECUTE FUNCTION elevenhouse_guard_flow_version_mutation()",
  "flow_versions.flow_versions_immutable_update":
    "CREATE TRIGGER flow_versions_immutable_update BEFORE UPDATE ON public.flow_versions FOR EACH ROW EXECUTE FUNCTION elevenhouse_guard_flow_version_mutation()",
  "flows.flow_publication_pointer_consistency":
    "CREATE CONSTRAINT TRIGGER flow_publication_pointer_consistency AFTER INSERT OR UPDATE ON public.flows DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION elevenhouse_assert_flow_publication_pointer()"
};
