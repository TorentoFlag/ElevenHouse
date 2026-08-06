import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { randomUUID } from "node:crypto";

import {
  buildInitialRefundCumulativePositionInput,
  buildSecondRefundPostingAllocationInput,
  buildRefundPostingAllocationInput
} from "../../../../domain/src/finance-core/postings/refund-posting-test-fixtures";
import { buildRefundFundingApprovalFixture } from "../../../../domain/src/finance-core/postings/refund-position-test-fixtures";
import { hashFinanceCommandPayload } from "../../../../domain/src/finance-authorization/canonical-command-payload";
import type { UnverifiedRefundFundingPosition } from "../../../../domain/src/finance-core/postings/refund-funding-position-types";
import type { RefundPostingAllocationAuthorityV1 } from "../../../../domain/src/finance-core/postings/refund-posting-types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";

const baseDatabaseUrl = integrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_refund_authority_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);

describe.sequential("refund allocation authority PostgreSQL boundary", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  const client = new Client({ connectionString: isolatedDatabaseUrl });

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    await client.connect();
    await client.query(readCurrentMigrationSql());
    await seedProviderIdentity();

    // This isolated persistence-boundary test does not exercise order/capture creation. It seeds
    // the aggregate's legitimate initial `requested` shape while keeping every production trigger
    // enabled for the authority under test.
    await client.query("alter table finance_refund_cases disable trigger all");
    await seedRequestedRefundCase("refund-1");
    await seedRequestedRefundCase("refund-2");
    await client.query("alter table finance_refund_cases enable trigger all");
  }, 30_000);

  afterAll(async () => {
    try {
      await client.end();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("issues one canonical immutable authority from a domain-valid allocation", async () => {
    const allocation = buildRefundPostingAllocationInput() as RefundPostingAllocationAuthorityV1;
    const inserted = await client.query<{
      authority_id: string;
      authority_version: string;
      allocation_preimage: string;
      allocation_digest: string;
    }>(
      `insert into finance_refund_allocation_authorities (
        refund_id, authority_id, authority_version, allocation_payload
      ) values ($1, $2, $3, $4::jsonb)
      returning authority_id, authority_version, allocation_preimage, allocation_digest`,
      [allocation.refundId, allocation.authorityId, allocation.version, JSON.stringify(allocation)]
    );

    expect(inserted.rows).toEqual([
      expect.objectContaining({
        authority_id: allocation.authorityId,
        authority_version: String(allocation.version),
        allocation_digest: allocation.allocationDigest
      })
    ]);
    expect(inserted.rows[0]?.allocation_preimage).not.toContain("allocationDigest");

    await expect(
      client.query(
        "update finance_refund_allocation_authorities set authority_id = 'tampered' where refund_id = 'refund-1'"
      )
    ).rejects.toThrow("refund allocation authorities are immutable");
  });

  it("rejects a payload whose self-hash or root contract does not match", async () => {
    const allocation = buildRefundPostingAllocationInput() as RefundPostingAllocationAuthorityV1;
    const invalidDigest = {
      ...allocation,
      refundId: "refund-2",
      allocationDigest: `sha256:${"0".repeat(64)}`
    };

    await expect(
      client.query(
        `insert into finance_refund_allocation_authorities (
          refund_id, authority_id, authority_version, allocation_payload
        ) values ('refund-2', $1, $2, $3::jsonb)`,
        [invalidDigest.authorityId, invalidDigest.version, JSON.stringify(invalidDigest)]
      )
    ).rejects.toThrow("refund allocation authority digest does not match payload");

    const { payableComponents, ...invalidRoot } = invalidDigest;
    expect(payableComponents).toBeDefined();

    await expect(
      client.query(
        `insert into finance_refund_allocation_authorities (
          refund_id, authority_id, authority_version, allocation_payload
        ) values ('refund-2', $1, $2, $3::jsonb)`,
        [invalidRoot.authorityId, invalidRoot.version, JSON.stringify(invalidRoot)]
      )
    ).rejects.toThrow("refund allocation authority payload does not match its owner");
  });

  it("refuses to attach an immutable allocation to a different refund economic identity", async () => {
    const allocation = buildRefundPostingAllocationInput();

    await expect(
      client.query(
        `update finance_refund_cases
         set allocation_authority_id = $2,
             allocation_authority_version = $3,
             allocation_authority_digest = $4
         where id = $1`,
        [
          "refund-1",
          allocation.authorityId,
          String(allocation.version),
          allocation.allocationDigest
        ]
      )
    ).rejects.toThrow("refund case allocation authority does not bind its economic identity");
  });

  it("stores a canonical append-only initial cumulative position", async () => {
    const position = buildInitialRefundCumulativePositionInput({
      providerAccountId: "arc-account-1",
      identityVersion: 1,
      provider: "arc_pay",
      merchantTenantId: "elevenhouse-test",
      environment: "sandbox",
      terminalScope: "test-payins",
      settlementScope: "test-settlement"
    }, "arc-payment-position-1");
    const inserted = await client.query<{
      position_digest: string;
      position_preimage: string;
      updated_at: string;
    }>(
      `insert into finance_refund_cumulative_positions (
        position_id, version, series_id, provider_account_id, provider_identity_version,
        provider_payment_id, currency, confirmed_cumulative_refunded_minor,
        confirmed_cumulative_payable_reversed_minor, confirmed_cumulative_platform_reversed_minor,
        position_payload
      ) values ($1, $2, 'arc-series-1', 'arc-account-1', 1, $3, 'RUB', 0, 0, 0, $4::jsonb)
      returning position_digest, position_preimage, updated_at::text`,
      [position.positionId, position.version, position.providerPaymentId, JSON.stringify(position)]
    );

    expect(inserted.rows).toEqual([
      expect.objectContaining({ position_digest: position.positionDigest })
    ]);
    expect(inserted.rows[0]?.position_preimage).not.toContain("positionDigest");
    expect(inserted.rows[0]?.updated_at).toContain("2026-08-03");
    await expect(
      client.query(
        "update finance_refund_cumulative_positions set confirmed_cumulative_refunded_minor = 1 where position_id = $1 and version = 0",
        [position.positionId]
      )
    ).rejects.toThrow("refund cumulative positions are append-only");
  });

  it("stores a canonical append-only funding position before a refund reserves it", async () => {
    const allocation = buildRefundPostingAllocationInput() as RefundPostingAllocationAuthorityV1;
    const fixture = buildRefundFundingApprovalFixture(allocation);
    const fixturePosition = fixture.positions[0];
    if (!fixturePosition) throw new Error("funding fixture must include a position");
    const { positionDigest, ...fixtureCore } = fixturePosition;
    expect(positionDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    const source = {
      kind: "payable_root_lot" as const,
      orderId: "integration-funding-position-order",
      rootLotId: "integration-funding-position-root"
    };
    const positionId = `refund-funding-position:${hashFinanceCommandPayload(source)}`;
    const fundingCore = {
      ...fixtureCore,
      source,
      positionId,
      providerAccount: {
        providerAccountId: "arc-account-1",
        identityVersion: 1,
        provider: "arc_pay" as const,
        merchantTenantId: "elevenhouse-test",
        environment: "sandbox" as const,
        terminalScope: "test-payins",
        settlementScope: "test-settlement"
      }
    };
    const position = Object.freeze({
      ...fundingCore,
      positionDigest: hashFinanceCommandPayload(fundingCore)
    });

    const inserted = await client.query<{
      position_digest: string;
      position_preimage: string;
      updated_at: string;
    }>(
      `insert into finance_refund_funding_positions (
        position_id, version, series_id, provider_account_id, provider_identity_version,
        provider_payment_id, currency, source_kind, source_payload,
        capacity_minor, free_minor, reserved_minor, consumed_minor, position_payload
      ) values (
        $1, $2, 'arc-series-1', $3, $4, $5, 'RUB', $6, $7::jsonb,
        $8, $9, $10, $11, $12::jsonb
      ) returning position_digest, position_preimage, updated_at::text`,
      [
        position.positionId,
        position.version,
        position.providerAccount.providerAccountId,
        position.providerAccount.identityVersion,
        position.providerPaymentId,
        position.source.kind,
        JSON.stringify(position.source),
        String(position.capacity.amountMinor),
        String(position.freeAmount.amountMinor),
        String(position.reservedAmount.amountMinor),
        String(position.consumedAmount.amountMinor),
        JSON.stringify(position)
      ]
    );

    expect(inserted.rows).toEqual([
      expect.objectContaining({ position_digest: position.positionDigest })
    ]);
    expect(inserted.rows[0]?.position_preimage).not.toContain("positionDigest");
    expect(inserted.rows[0]?.updated_at).toContain("2026-08-03");
    await expect(
      client.query(
        "update finance_refund_funding_positions set free_minor = 1 where position_id = $1 and version = 0",
        [position.positionId]
      )
    ).rejects.toThrow("refund funding positions are append-only");
  });

  it("binds refund funding coverage to the immutable approved allocation", async () => {
    const allocation = buildRefundPostingAllocationInput() as RefundPostingAllocationAuthorityV1;
    const { binding, positions } = buildRefundFundingApprovalFixture(allocation);
    await seedFundingFixtureProviderIdentity();
    for (const position of uniqueFundingPositions([
      ...positions,
      ...binding.transitions.map((transition) => transition.nextPosition)
    ])) {
      await insertFundingPosition(position, "arc-series-live-primary");
    }
    const inserted = await client.query<{
      binding_digest: string;
      binding_preimage: string;
    }>(
      `insert into finance_refund_funding_transition_authorities (
        refund_id, binding_id, operation, binding_payload
      ) values ($1, $2, $3, $4::jsonb)
      returning binding_digest, binding_preimage`,
      [allocation.refundId, binding.bindingId, binding.operation, JSON.stringify(binding)]
    );

    expect(inserted.rows).toEqual([
      expect.objectContaining({ binding_digest: binding.bindingDigest })
    ]);
    expect(inserted.rows[0]?.binding_preimage).not.toContain("bindingDigest");
    await expect(
      client.query(
        "delete from finance_refund_funding_transition_authorities where refund_id = $1 and operation = 'approved'",
        [allocation.refundId]
      )
    ).rejects.toThrow("refund funding transition authorities are immutable");
  });

  it("rejects funding authority transitions whose position snapshots were not persisted", async () => {
    const firstAllocation = buildRefundPostingAllocationInput() as RefundPostingAllocationAuthorityV1;
    const allocation = buildSecondRefundPostingAllocationInput(firstAllocation);
    await client.query(
      `insert into finance_refund_allocation_authorities (
        refund_id, authority_id, authority_version, allocation_payload
      ) values ($1, $2, $3, $4::jsonb)`,
      [allocation.refundId, allocation.authorityId, allocation.version, JSON.stringify(allocation)]
    );
    const fixture = buildRefundFundingApprovalFixture(allocation);

    await expect(
      client.query(
        `insert into finance_refund_funding_transition_authorities (
          refund_id, binding_id, operation, binding_payload
        ) values ($1, $2, $3, $4::jsonb)`,
        [allocation.refundId, fixture.binding.bindingId, fixture.binding.operation, JSON.stringify(fixture.binding)]
      )
    ).rejects.toThrow("refund funding transition authority does not bind persisted positions");
  });

  async function seedProviderIdentity(): Promise<void> {
    await client.query("begin");
    try {
      await client.query(
        `insert into finance_provider_account_series (
          series_id, provider, active_identity_version, head_version
        ) values ('arc-series-1', 'arc_pay', 1, 1)`
      );
      await client.query(
        `insert into finance_provider_accounts (
          series_id, provider_account_id, identity_version, provider, merchant_tenant_id,
          environment, terminal_scope, settlement_scope
        ) values (
          'arc-series-1', 'arc-account-1', 1, 'arc_pay', 'elevenhouse-test',
          'sandbox', 'test-payins', 'test-settlement'
        )`
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  async function seedFundingFixtureProviderIdentity(): Promise<void> {
    await client.query("begin");
    try {
      await client.query(
        `insert into finance_provider_account_series (
          series_id, provider, active_identity_version, head_version
        ) values ('arc-series-live-primary', 'arc_pay', 1, 1)`
      );
      await insertProviderIdentityVersion(1, "arc-account-live-primary-v1", null, null);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    for (const [version, accountId, predecessor] of [
      [2, "arc-account-live-primary-v2", "arc-account-live-primary-v1"],
      [3, "arc-account-live-primary", "arc-account-live-primary-v2"]
    ] as const) {
      await client.query("begin");
      try {
        await client.query(
          `update finance_provider_account_series
             set active_identity_version = $1::integer, head_version = $1::numeric
           where series_id = 'arc-series-live-primary'
             and active_identity_version = $2::integer and head_version = $2::numeric`,
          [version, version - 1]
        );
        await insertProviderIdentityVersion(version, accountId, predecessor, version - 1);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  }

  async function insertProviderIdentityVersion(
    version: number,
    accountId: string,
    predecessorAccountId: string | null,
    predecessorVersion: number | null
  ): Promise<void> {
    await client.query(
      `insert into finance_provider_accounts (
        series_id, provider_account_id, identity_version, provider, merchant_tenant_id,
        environment, terminal_scope, settlement_scope,
        predecessor_provider_account_id, predecessor_identity_version
      ) values (
        'arc-series-live-primary', $1, $2, 'arc_pay', 'elevenhouse-live',
        'live', 'primary-payins', 'merchant-ledger-primary', $3, $4
      )`,
      [accountId, version, predecessorAccountId, predecessorVersion]
    );
  }

  async function insertFundingPosition(
    position: UnverifiedRefundFundingPosition,
    seriesId: string
  ): Promise<void> {
    await client.query(
      `insert into finance_refund_funding_positions (
        position_id, version, series_id, provider_account_id, provider_identity_version,
        provider_payment_id, currency, source_kind, source_payload,
        capacity_minor, free_minor, reserved_minor, consumed_minor, position_payload
      ) values (
        $1, $2, $3, $4, $5, $6, 'RUB', $7, $8::jsonb,
        $9, $10, $11, $12, $13::jsonb
      )`,
      [
        position.positionId,
        position.version,
        seriesId,
        position.providerAccount.providerAccountId,
        position.providerAccount.identityVersion,
        position.providerPaymentId,
        position.source.kind,
        JSON.stringify(position.source),
        String(position.capacity.amountMinor),
        String(position.freeAmount.amountMinor),
        String(position.reservedAmount.amountMinor),
        String(position.consumedAmount.amountMinor),
        JSON.stringify(position)
      ]
    );
  }

  function uniqueFundingPositions(
    positions: readonly UnverifiedRefundFundingPosition[]
  ): readonly UnverifiedRefundFundingPosition[] {
    return [...new Map(positions.map((position) => [`${position.positionId}:${position.version}`, position])).values()];
  }

  async function seedRequestedRefundCase(refundId: string): Promise<void> {
    await client.query(
      `insert into finance_refund_cases (
        id, order_id, economic_payment_intent_id, wallet_id, astrologer_user_id, currency,
        series_id, provider_account_id, provider_identity_version, provider_payment_id,
        previous_cumulative_refunded_minor, approved_cumulative_refunded_minor, status, version
      ) values (
        $1, $2::uuid, 'payment-intent-1', $3::uuid, $4::uuid, 'RUB',
        'arc-series-1', 'arc-account-1', 1, $5, 0, 2500, 'requested', 1
      )`,
      [refundId, randomUUID(), randomUUID(), randomUUID(), `arc-payment-${refundId}`]
    );
  }
});

function integrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function withDatabaseName(databaseUrl: string, targetDatabaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${targetDatabaseName}`;
  return url.toString();
}
