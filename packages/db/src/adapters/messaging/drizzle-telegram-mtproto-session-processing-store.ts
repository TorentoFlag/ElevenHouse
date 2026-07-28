import { and, eq, sql } from "drizzle-orm";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  messagingChannelConnections,
  messagingTelegramMtprotoSessions,
  type MessagingEncryptedSecretSnapshot
} from "../../schema";

type MessagingTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type MessagingDatabase = ElevenHouseDatabase | MessagingTransaction;

export type TelegramMtprotoSessionLease = {
  readonly channelConnectionId: string;
  readonly astrologerUserId: string;
  readonly encryptedSession: MessagingEncryptedSecretSnapshot;
  readonly telegramUserId: string | null;
  readonly pts: number | null;
  readonly qts: number | null;
  readonly dateCursor: Date | null;
  readonly seq: number | null;
};

export type TelegramMtprotoSessionProcessingStore = {
  readonly claimAvailable: (input: {
    readonly leaseOwner: string;
    readonly now: Date;
    readonly leaseDurationMs: number;
    readonly limit: number;
  }) => Promise<readonly TelegramMtprotoSessionLease[]>;
  readonly heartbeat: (input: {
    readonly channelConnectionId: string;
    readonly leaseOwner: string;
    readonly now: Date;
    readonly leaseDurationMs: number;
  }) => Promise<void>;
  readonly release: (input: {
    readonly channelConnectionId: string;
    readonly leaseOwner: string;
    readonly now: Date;
  }) => Promise<void>;
  readonly markReauthRequired: (input: {
    readonly channelConnectionId: string;
    readonly leaseOwner: string;
    readonly errorCode: string;
    readonly errorMessage: string;
    readonly now: Date;
  }) => Promise<void>;
  readonly updateCursors: (input: {
    readonly channelConnectionId: string;
    readonly leaseOwner: string;
    readonly pts: number | null;
    readonly qts: number | null;
    readonly dateCursor: Date | null;
    readonly seq: number | null;
    readonly now: Date;
  }) => Promise<void>;
};

export function createDrizzleTelegramMtprotoSessionProcessingStore(
  database: ElevenHouseDatabase
): TelegramMtprotoSessionProcessingStore {
  return {
    claimAvailable: (input) => claimAvailable(database, input),
    heartbeat: (input) => heartbeat(database, input),
    release: (input) => release(database, input),
    markReauthRequired: (input) => markReauthRequired(database, input),
    updateCursors: (input) => updateCursors(database, input)
  };
}

async function claimAvailable(
  database: ElevenHouseDatabase,
  input: Parameters<TelegramMtprotoSessionProcessingStore["claimAvailable"]>[0]
): Promise<readonly TelegramMtprotoSessionLease[]> {
  const leasedUntil = addMilliseconds(input.now, input.leaseDurationMs);
  const rows = await database.transaction(async (transaction) => {
    const result = await transaction.execute(sql<TelegramMtprotoSessionLease>`
      with claimed as (
        select ${messagingTelegramMtprotoSessions.channelConnectionId} as channel_connection_id
        from ${messagingTelegramMtprotoSessions}
        inner join ${messagingChannelConnections}
          on ${messagingChannelConnections.id} = ${messagingTelegramMtprotoSessions.channelConnectionId}
        where ${messagingTelegramMtprotoSessions.loginState} = 'authorized'
          and ${messagingTelegramMtprotoSessions.sessionEncrypted} is not null
          and ${messagingChannelConnections.status} = 'active'
          and ${messagingChannelConnections.provider} = 'telegram'
          and ${messagingChannelConnections.mode} = 'telegram_mtproto_account'
          and (
            ${messagingTelegramMtprotoSessions.leaseOwner} is null
            or ${messagingTelegramMtprotoSessions.leaseOwner} = ${input.leaseOwner}
            or ${messagingTelegramMtprotoSessions.leasedUntil} <= ${input.now}
          )
        order by ${messagingTelegramMtprotoSessions.updatedAt}, ${messagingTelegramMtprotoSessions.channelConnectionId}
        limit ${input.limit}
        for update skip locked
      )
      update ${messagingTelegramMtprotoSessions}
      set
        lease_owner = ${input.leaseOwner},
        leased_until = ${leasedUntil},
        last_listener_heartbeat_at = ${input.now},
        updated_at = ${input.now}
      from claimed, ${messagingChannelConnections}
      where ${messagingTelegramMtprotoSessions.channelConnectionId} = claimed.channel_connection_id
        and ${messagingChannelConnections.id} = ${messagingTelegramMtprotoSessions.channelConnectionId}
      returning
        ${messagingTelegramMtprotoSessions.channelConnectionId} as "channelConnectionId",
        ${messagingChannelConnections.astrologerUserId} as "astrologerUserId",
        ${messagingTelegramMtprotoSessions.sessionEncrypted} as "encryptedSession",
        ${messagingTelegramMtprotoSessions.telegramUserId} as "telegramUserId",
        ${messagingTelegramMtprotoSessions.pts} as "pts",
        ${messagingTelegramMtprotoSessions.qts} as "qts",
        ${messagingTelegramMtprotoSessions.dateCursor} as "dateCursor",
        ${messagingTelegramMtprotoSessions.seq} as "seq"
    `);

    return result.rows as unknown as TelegramMtprotoSessionLease[];
  });

  return rows.map(toTelegramMtprotoSessionLease);
}

async function heartbeat(
  database: MessagingDatabase,
  input: Parameters<TelegramMtprotoSessionProcessingStore["heartbeat"]>[0]
): Promise<void> {
  await database
    .update(messagingTelegramMtprotoSessions)
    .set({
      leasedUntil: addMilliseconds(input.now, input.leaseDurationMs),
      lastListenerHeartbeatAt: input.now,
      updatedAt: input.now
    })
    .where(
      and(
        eq(messagingTelegramMtprotoSessions.channelConnectionId, input.channelConnectionId),
        eq(messagingTelegramMtprotoSessions.leaseOwner, input.leaseOwner),
        eq(messagingTelegramMtprotoSessions.loginState, "authorized")
      )
    );
}

async function release(
  database: MessagingDatabase,
  input: Parameters<TelegramMtprotoSessionProcessingStore["release"]>[0]
): Promise<void> {
  await database
    .update(messagingTelegramMtprotoSessions)
    .set({
      leaseOwner: null,
      leasedUntil: null,
      updatedAt: input.now
    })
    .where(
      and(
        eq(messagingTelegramMtprotoSessions.channelConnectionId, input.channelConnectionId),
        eq(messagingTelegramMtprotoSessions.leaseOwner, input.leaseOwner)
      )
    );
}

async function markReauthRequired(
  database: ElevenHouseDatabase,
  input: Parameters<TelegramMtprotoSessionProcessingStore["markReauthRequired"]>[0]
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction
      .update(messagingTelegramMtprotoSessions)
      .set({
        loginState: "reauth_required",
        leaseOwner: null,
        leasedUntil: null,
        updatedAt: input.now
      })
      .where(
        and(
          eq(messagingTelegramMtprotoSessions.channelConnectionId, input.channelConnectionId),
          eq(messagingTelegramMtprotoSessions.leaseOwner, input.leaseOwner)
        )
      );

    await transaction
      .update(messagingChannelConnections)
      .set({
        status: "reauth_required",
        lastErrorCode: input.errorCode,
        lastErrorMessage: input.errorMessage.slice(0, 500),
        updatedAt: input.now
      })
      .where(eq(messagingChannelConnections.id, input.channelConnectionId));
  });
}

async function updateCursors(
  database: MessagingDatabase,
  input: Parameters<TelegramMtprotoSessionProcessingStore["updateCursors"]>[0]
): Promise<void> {
  await database
    .update(messagingTelegramMtprotoSessions)
    .set({
      pts: input.pts,
      qts: input.qts,
      dateCursor: input.dateCursor,
      seq: input.seq,
      updatedAt: input.now
    })
    .where(
      and(
        eq(messagingTelegramMtprotoSessions.channelConnectionId, input.channelConnectionId),
        eq(messagingTelegramMtprotoSessions.leaseOwner, input.leaseOwner),
        eq(messagingTelegramMtprotoSessions.loginState, "authorized")
      )
    );
}

function toTelegramMtprotoSessionLease(row: TelegramMtprotoSessionLease): TelegramMtprotoSessionLease {
  return {
    channelConnectionId: row.channelConnectionId,
    astrologerUserId: row.astrologerUserId,
    encryptedSession: row.encryptedSession,
    telegramUserId: row.telegramUserId,
    pts: row.pts,
    qts: row.qts,
    dateCursor: row.dateCursor,
    seq: row.seq
  };
}

function addMilliseconds(value: Date, milliseconds: number): Date {
  return new Date(value.getTime() + milliseconds);
}
