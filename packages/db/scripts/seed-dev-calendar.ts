import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "dotenv";
import { Pool, type PoolClient } from "pg";
import { assertDevelopmentDatabaseUrl, createPostgresConnectionConfig } from "../src/index";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const seededAt = "2026-07-20T06:00:00.000Z";
const ownerUserId = "7d1be2fc-a9e9-47fc-89d9-ab01a4d6480b";
const ownerPhoneNumber = "+78005553535";

type Queryable = Pick<PoolClient, "query">;

type SeedClient = {
  readonly userId: string;
  readonly roleId: string;
  readonly identityId: string;
  readonly displayName: string;
  readonly phoneNumber: string;
  readonly locale: "ru" | "en";
  readonly timeZone: string;
};

type SeedProduct = {
  readonly id: string;
  readonly type: "single" | "mini" | "pack" | "sub";
  readonly title: string;
  readonly subtitle: string;
  readonly priceMinor: number;
  readonly executionMode: "live" | "async" | "instant";
  readonly paymentModel: "once" | "pack" | "sub" | "free";
  readonly durationMinutes: number;
  readonly durationLabel: string;
  readonly participantMode: "solo" | "group";
  readonly packageSessionCount: number | null;
  readonly packageDiscountPercent: number | null;
  readonly subscriptionPeriod: "month" | null;
  readonly trialDays: number | null;
  readonly groupSize: number | null;
  readonly deliveryFormat: "video" | "audio" | "chat" | "file";
};

type SeedBooking = {
  readonly id: string;
  readonly reservationId: string;
  readonly clientUserId: string;
  readonly productId: string;
  readonly source: "manual" | "client_paid";
  readonly startAt: string;
  readonly endAt: string;
};

type SeedManualBlock = {
  readonly id: string;
  readonly reservationId: string;
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
};

export const devCalendarSeedPlan = {
  ownerUserId,
  ownerPhoneNumber,
  ownerRoleId: "10000000-0000-4000-8000-000000000001",
  ownerIdentityId: "10000000-0000-4000-8000-000000000002",
  scheduleId: "10000000-0000-4000-8000-000000000010",
  ownerProfile: {
    publicHandle: "alisa-vega",
    publicName: "Алиса Вега",
    headline: "QA астролог",
    bio: "Локальный профиль с плотным календарём для проверки CRM-сценариев.",
    timeZone: "Europe/Moscow",
    locale: "ru"
  },
  clients: [
    {
      userId: "10000000-0000-4000-8000-000000000101",
      roleId: "10000000-0000-4000-8000-000000000111",
      identityId: "10000000-0000-4000-8000-000000000121",
      displayName: "Марина Краснова",
      phoneNumber: "+79990000101",
      locale: "ru",
      timeZone: "Europe/Moscow"
    },
    {
      userId: "10000000-0000-4000-8000-000000000102",
      roleId: "10000000-0000-4000-8000-000000000112",
      identityId: "10000000-0000-4000-8000-000000000122",
      displayName: "Илья Громов",
      phoneNumber: "+79990000102",
      locale: "ru",
      timeZone: "Europe/Moscow"
    },
    {
      userId: "10000000-0000-4000-8000-000000000103",
      roleId: "10000000-0000-4000-8000-000000000113",
      identityId: "10000000-0000-4000-8000-000000000123",
      displayName: "Софья Орлова",
      phoneNumber: "+79990000103",
      locale: "ru",
      timeZone: "Europe/Moscow"
    },
    {
      userId: "10000000-0000-4000-8000-000000000104",
      roleId: "10000000-0000-4000-8000-000000000114",
      identityId: "10000000-0000-4000-8000-000000000124",
      displayName: "Денис Морозов",
      phoneNumber: "+79990000104",
      locale: "ru",
      timeZone: "Europe/Moscow"
    },
    {
      userId: "10000000-0000-4000-8000-000000000105",
      roleId: "10000000-0000-4000-8000-000000000115",
      identityId: "10000000-0000-4000-8000-000000000125",
      displayName: "Анна Белова",
      phoneNumber: "+79990000105",
      locale: "ru",
      timeZone: "Europe/Moscow"
    },
    {
      userId: "10000000-0000-4000-8000-000000000106",
      roleId: "10000000-0000-4000-8000-000000000116",
      identityId: "10000000-0000-4000-8000-000000000126",
      displayName: "Roman Blake",
      phoneNumber: "+79990000106",
      locale: "en",
      timeZone: "Europe/London"
    },
    {
      userId: "10000000-0000-4000-8000-000000000107",
      roleId: "10000000-0000-4000-8000-000000000117",
      identityId: "10000000-0000-4000-8000-000000000127",
      displayName: "Екатерина Соловьёва",
      phoneNumber: "+79990000107",
      locale: "ru",
      timeZone: "Europe/Moscow"
    },
    {
      userId: "10000000-0000-4000-8000-000000000108",
      roleId: "10000000-0000-4000-8000-000000000118",
      identityId: "10000000-0000-4000-8000-000000000128",
      displayName: "Павел Кузнецов",
      phoneNumber: "+79990000108",
      locale: "ru",
      timeZone: "Europe/Moscow"
    }
  ] satisfies readonly SeedClient[],
  products: [
    {
      id: "10000000-0000-4000-8000-000000000201",
      type: "single",
      title: "Натальная консультация",
      subtitle: "Разбор карты и личных циклов",
      priceMinor: 490000,
      executionMode: "live",
      paymentModel: "once",
      durationMinutes: 60,
      durationLabel: "60 мин",
      participantMode: "solo",
      packageSessionCount: null,
      packageDiscountPercent: null,
      subscriptionPeriod: null,
      trialDays: null,
      groupSize: null,
      deliveryFormat: "video"
    },
    {
      id: "10000000-0000-4000-8000-000000000202",
      type: "single",
      title: "Синастрия пары",
      subtitle: "Совместимость и точки напряжения",
      priceMinor: 790000,
      executionMode: "live",
      paymentModel: "once",
      durationMinutes: 90,
      durationLabel: "90 мин",
      participantMode: "solo",
      packageSessionCount: null,
      packageDiscountPercent: null,
      subscriptionPeriod: null,
      trialDays: null,
      groupSize: null,
      deliveryFormat: "audio"
    },
    {
      id: "10000000-0000-4000-8000-000000000203",
      type: "mini",
      title: "Экспресс-вопрос",
      subtitle: "Короткий ответ в чате",
      priceMinor: 190000,
      executionMode: "instant",
      paymentModel: "once",
      durationMinutes: 30,
      durationLabel: "30 мин",
      participantMode: "solo",
      packageSessionCount: null,
      packageDiscountPercent: null,
      subscriptionPeriod: null,
      trialDays: null,
      groupSize: null,
      deliveryFormat: "chat"
    },
    {
      id: "10000000-0000-4000-8000-000000000204",
      type: "pack",
      title: "Месячное сопровождение",
      subtitle: "Три встречи и письменный план",
      priceMinor: 1290000,
      executionMode: "async",
      paymentModel: "pack",
      durationMinutes: 75,
      durationLabel: "75 мин",
      participantMode: "solo",
      packageSessionCount: 3,
      packageDiscountPercent: 10,
      subscriptionPeriod: null,
      trialDays: null,
      groupSize: null,
      deliveryFormat: "file"
    }
  ] satisfies readonly SeedProduct[],
  weeklyPeriods: [
    { weekday: 1, startMinute: 9 * 60, endMinute: 13 * 60 },
    { weekday: 1, startMinute: 14 * 60, endMinute: 18 * 60 },
    { weekday: 2, startMinute: 9 * 60, endMinute: 13 * 60 },
    { weekday: 2, startMinute: 14 * 60, endMinute: 18 * 60 },
    { weekday: 3, startMinute: 10 * 60, endMinute: 14 * 60 },
    { weekday: 3, startMinute: 15 * 60, endMinute: 19 * 60 },
    { weekday: 4, startMinute: 9 * 60, endMinute: 12 * 60 },
    { weekday: 4, startMinute: 13 * 60, endMinute: 18 * 60 },
    { weekday: 5, startMinute: 10 * 60, endMinute: 13 * 60 },
    { weekday: 5, startMinute: 14 * 60, endMinute: 18 * 60 },
    { weekday: 6, startMinute: 10 * 60, endMinute: 15 * 60 },
    { weekday: 7, startMinute: 11 * 60, endMinute: 16 * 60 }
  ],
  bookings: [
    booking(1, 1, 1, "manual", "2026-07-20T06:00:00.000Z", "2026-07-20T07:00:00.000Z"),
    booking(2, 2, 2, "client_paid", "2026-07-20T08:30:00.000Z", "2026-07-20T10:00:00.000Z"),
    booking(3, 3, 3, "manual", "2026-07-21T07:00:00.000Z", "2026-07-21T07:30:00.000Z"),
    booking(4, 4, 1, "client_paid", "2026-07-21T13:00:00.000Z", "2026-07-21T14:00:00.000Z"),
    booking(5, 5, 4, "manual", "2026-07-22T07:00:00.000Z", "2026-07-22T08:15:00.000Z"),
    booking(6, 6, 2, "client_paid", "2026-07-22T14:00:00.000Z", "2026-07-22T15:30:00.000Z"),
    booking(7, 7, 1, "manual", "2026-07-23T06:00:00.000Z", "2026-07-23T07:00:00.000Z"),
    booking(8, 8, 3, "client_paid", "2026-07-23T09:00:00.000Z", "2026-07-23T09:30:00.000Z"),
    booking(9, 1, 4, "manual", "2026-07-23T12:30:00.000Z", "2026-07-23T13:45:00.000Z"),
    booking(10, 2, 1, "client_paid", "2026-07-24T07:00:00.000Z", "2026-07-24T08:00:00.000Z"),
    booking(11, 3, 2, "manual", "2026-07-24T11:00:00.000Z", "2026-07-24T12:30:00.000Z"),
    booking(12, 4, 3, "client_paid", "2026-07-25T08:00:00.000Z", "2026-07-25T08:30:00.000Z"),
    booking(13, 5, 1, "manual", "2026-07-25T10:00:00.000Z", "2026-07-25T11:00:00.000Z"),
    booking(14, 6, 4, "client_paid", "2026-07-26T09:00:00.000Z", "2026-07-26T10:15:00.000Z")
  ] satisfies readonly SeedBooking[],
  manualBlocks: [
    block(1, "Личное время", "2026-07-20T11:00:00.000Z", "2026-07-20T12:00:00.000Z"),
    block(2, "Подготовка к эфиру", "2026-07-22T10:00:00.000Z", "2026-07-22T11:30:00.000Z"),
    block(3, "Созвон с командой", "2026-07-24T13:00:00.000Z", "2026-07-24T15:00:00.000Z")
  ] satisfies readonly SeedManualBlock[]
} as const;

export async function seedDevCalendar(client: Queryable): Promise<{
  readonly ownerUserId: string;
  readonly scheduleId: string;
  readonly productCount: number;
  readonly clientCount: number;
  readonly bookingCount: number;
  readonly manualBlockCount: number;
}> {
  const scheduleId = await upsertOwnerAndSchedule(client);
  await upsertClients(client);
  await upsertProducts(client);
  await replaceScheduleProducts(client, scheduleId);
  await replaceSeededCalendarEntries(client, scheduleId);

  return {
    ownerUserId,
    scheduleId,
    productCount: devCalendarSeedPlan.products.length,
    clientCount: devCalendarSeedPlan.clients.length,
    bookingCount: devCalendarSeedPlan.bookings.length,
    manualBlockCount: devCalendarSeedPlan.manualBlocks.length
  };
}

async function upsertOwnerAndSchedule(client: Queryable): Promise<string> {
  await client.query(
    `insert into users (id, status, created_at, updated_at)
     values ($1, 'active', $2, $2)
     on conflict (id) do update
     set status = 'active',
         updated_at = excluded.updated_at`,
    [ownerUserId, seededAt]
  );
  await client.query(
    `insert into user_role_assignments (id, user_id, role, assigned_at)
     values ($1, $2, 'astrologer', $3)
     on conflict (user_id, role) do update
     set assigned_at = excluded.assigned_at`,
    [devCalendarSeedPlan.ownerRoleId, ownerUserId, seededAt]
  );
  await client.query(
    `insert into auth_identities
       (id, user_id, provider, provider_subject, phone_number, phone_verified_at, created_at, updated_at)
     values ($1, $2, 'phone', $3, $3, $4, $4, $4)
     on conflict (provider, provider_subject) do update
     set user_id = excluded.user_id,
         phone_number = excluded.phone_number,
         phone_verified_at = excluded.phone_verified_at,
         updated_at = excluded.updated_at`,
    [devCalendarSeedPlan.ownerIdentityId, ownerUserId, ownerPhoneNumber, seededAt]
  );
  await client.query(
    `insert into user_profiles (user_id, display_name, created_at, updated_at)
     values ($1, $2, $3, $3)
     on conflict (user_id) do update
     set display_name = excluded.display_name,
         updated_at = excluded.updated_at`,
    [ownerUserId, devCalendarSeedPlan.ownerProfile.publicName, seededAt]
  );
  await client.query(
    `insert into astrologer_profiles
       (owner_user_id, public_handle, public_name, headline, bio, timezone, locale,
        consultation_languages, visibility_status, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'draft', $9, $9)
     on conflict (owner_user_id) do update
     set public_handle = excluded.public_handle,
         public_name = excluded.public_name,
         headline = excluded.headline,
         bio = excluded.bio,
         timezone = excluded.timezone,
         locale = excluded.locale,
         consultation_languages = excluded.consultation_languages,
         visibility_status = excluded.visibility_status,
         updated_at = excluded.updated_at`,
    [
      ownerUserId,
      devCalendarSeedPlan.ownerProfile.publicHandle,
      devCalendarSeedPlan.ownerProfile.publicName,
      devCalendarSeedPlan.ownerProfile.headline,
      devCalendarSeedPlan.ownerProfile.bio,
      devCalendarSeedPlan.ownerProfile.timeZone,
      devCalendarSeedPlan.ownerProfile.locale,
      JSON.stringify(["ru", "en"]),
      seededAt
    ]
  );

  const existing = await client.query<{ id: string }>(
    `select id
       from availability_schedules
      where owner_user_id = $1 and is_default = true
      limit 1`,
    [ownerUserId]
  );
  const scheduleId = existing.rows[0]?.id ?? devCalendarSeedPlan.scheduleId;

  if (existing.rows.length === 0) {
    await client.query(
      `insert into availability_schedules
         (id, owner_user_id, name, time_zone, is_default, version, start_interval_minutes,
          buffer_before_minutes, buffer_after_minutes, minimum_notice_minutes,
          booking_horizon_days, maximum_bookings_per_day, created_at, updated_at)
       values ($1, $2, 'Calendar QA Default', $3, true, 1, 30, 0, 0, 0, 93, 8, $4, $4)`,
      [scheduleId, ownerUserId, devCalendarSeedPlan.ownerProfile.timeZone, seededAt]
    );
  } else {
    await client.query(
      `update availability_schedules
          set name = 'Calendar QA Default',
              time_zone = $2,
              is_default = true,
              version = version + 1,
              start_interval_minutes = 30,
              buffer_before_minutes = 0,
              buffer_after_minutes = 0,
              minimum_notice_minutes = 0,
              booking_horizon_days = 93,
              maximum_bookings_per_day = 8,
              updated_at = $3
        where id = $1 and owner_user_id = $4`,
      [scheduleId, devCalendarSeedPlan.ownerProfile.timeZone, seededAt, ownerUserId]
    );
  }

  await client.query("delete from availability_weekly_periods where schedule_id = $1", [
    scheduleId
  ]);
  await client.query("delete from availability_date_overrides where schedule_id = $1", [
    scheduleId
  ]);
  await insertMany(
    client,
    `insert into availability_weekly_periods
       (schedule_id, owner_user_id, weekday, start_minute, end_minute)
     values`,
    devCalendarSeedPlan.weeklyPeriods.map((period) => [
      scheduleId,
      ownerUserId,
      period.weekday,
      period.startMinute,
      period.endMinute
    ])
  );

  return scheduleId;
}

async function upsertClients(client: Queryable): Promise<void> {
  for (const seedClient of devCalendarSeedPlan.clients) {
    await client.query(
      `insert into users (id, status, created_at, updated_at)
       values ($1, 'active', $2, $2)
       on conflict (id) do update
       set status = 'active',
           updated_at = excluded.updated_at`,
      [seedClient.userId, seededAt]
    );
    await client.query(
      `insert into user_role_assignments (id, user_id, role, assigned_at)
       values ($1, $2, 'client', $3)
       on conflict (user_id, role) do update
       set assigned_at = excluded.assigned_at`,
      [seedClient.roleId, seedClient.userId, seededAt]
    );
    await client.query(
      `insert into auth_identities
         (id, user_id, provider, provider_subject, phone_number, phone_verified_at, created_at, updated_at)
       values ($1, $2, 'phone', $3, $3, $4, $4, $4)
       on conflict (provider, provider_subject) do update
       set user_id = excluded.user_id,
           phone_number = excluded.phone_number,
           phone_verified_at = excluded.phone_verified_at,
           updated_at = excluded.updated_at`,
      [seedClient.identityId, seedClient.userId, seedClient.phoneNumber, seededAt]
    );
    await client.query(
      `insert into user_profiles (user_id, display_name, created_at, updated_at)
       values ($1, $2, $3, $3)
       on conflict (user_id) do update
       set display_name = excluded.display_name,
           updated_at = excluded.updated_at`,
      [seedClient.userId, seedClient.displayName, seededAt]
    );
    await client.query(
      `insert into client_profiles
         (user_id, display_name_snapshot, preferred_locale, timezone, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $5)
       on conflict (user_id) do update
       set display_name_snapshot = excluded.display_name_snapshot,
           preferred_locale = excluded.preferred_locale,
           timezone = excluded.timezone,
           updated_at = excluded.updated_at`,
      [seedClient.userId, seedClient.displayName, seedClient.locale, seedClient.timeZone, seededAt]
    );
    await client.query(
      `insert into client_astrologer_relationships
         (client_user_id, astrologer_user_id, source, status, first_linked_at,
          last_linked_at, created_at, updated_at)
       values ($1, $2, 'manual', 'active', $3, $3, $3, $3)
       on conflict (client_user_id, astrologer_user_id) do update
       set status = 'active',
           last_linked_at = excluded.last_linked_at,
           archived_at = null,
           blocked_at = null,
           updated_at = excluded.updated_at`,
      [seedClient.userId, ownerUserId, seededAt]
    );
  }
}

async function upsertProducts(client: Queryable): Promise<void> {
  for (const product of devCalendarSeedPlan.products) {
    await client.query(
      `insert into products
         (id, owner_user_id, type, status, title, subtitle, price_minor, currency,
          execution_mode, payment_model, duration_minutes, duration_label,
          package_session_count, package_discount_percent, subscription_period, trial_days,
          participant_mode, group_size, created_at, updated_at)
       values ($1, $2, $3, 'active', $4, $5, $6, 'RUB', $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $17)
       on conflict (id) do update
       set owner_user_id = excluded.owner_user_id,
           type = excluded.type,
           status = excluded.status,
           title = excluded.title,
           subtitle = excluded.subtitle,
           price_minor = excluded.price_minor,
           currency = excluded.currency,
           execution_mode = excluded.execution_mode,
           payment_model = excluded.payment_model,
           duration_minutes = excluded.duration_minutes,
           duration_label = excluded.duration_label,
           package_session_count = excluded.package_session_count,
           package_discount_percent = excluded.package_discount_percent,
           subscription_period = excluded.subscription_period,
           trial_days = excluded.trial_days,
           participant_mode = excluded.participant_mode,
           group_size = excluded.group_size,
           updated_at = excluded.updated_at`,
      [
        product.id,
        ownerUserId,
        product.type,
        product.title,
        product.subtitle,
        product.priceMinor,
        product.executionMode,
        product.paymentModel,
        product.durationMinutes,
        product.durationLabel,
        product.packageSessionCount,
        product.packageDiscountPercent,
        product.subscriptionPeriod,
        product.trialDays,
        product.participantMode,
        product.groupSize,
        seededAt
      ]
    );
    await client.query("delete from product_delivery_formats where product_id = $1", [product.id]);
    await client.query(
      `insert into product_delivery_formats (product_id, value, "order")
       values ($1, $2, 0)`,
      [product.id, product.deliveryFormat]
    );
  }
}

async function replaceScheduleProducts(client: Queryable, scheduleId: string): Promise<void> {
  await client.query("delete from availability_product_assignments where schedule_id = $1", [
    scheduleId
  ]);
  await insertMany(
    client,
    `insert into availability_product_assignments (schedule_id, owner_user_id, product_id)
     values`,
    devCalendarSeedPlan.products.map((product) => [scheduleId, ownerUserId, product.id])
  );
}

async function replaceSeededCalendarEntries(client: Queryable, scheduleId: string): Promise<void> {
  await client.query("delete from bookings where id = any($1::uuid[])", [
    devCalendarSeedPlan.bookings.map((bookingItem) => bookingItem.id)
  ]);
  await client.query("delete from manual_calendar_blocks where id = any($1::uuid[])", [
    devCalendarSeedPlan.manualBlocks.map((manualBlock) => manualBlock.id)
  ]);
  await client.query("delete from schedule_reservations where id = any($1::uuid[])", [
    [
      ...devCalendarSeedPlan.bookings.map((bookingItem) => bookingItem.reservationId),
      ...devCalendarSeedPlan.manualBlocks.map((manualBlock) => manualBlock.reservationId)
    ]
  ]);

  await insertMany(
    client,
    `insert into schedule_reservations
       (id, owner_user_id, schedule_id, kind, lifecycle, service_start_at, service_end_at,
        occupied_start_at, occupied_end_at, source_aggregate_id, created_at, updated_at)
     values`,
    [
      ...devCalendarSeedPlan.bookings.map((bookingItem) => [
        bookingItem.reservationId,
        ownerUserId,
        scheduleId,
        "booking",
        "active",
        bookingItem.startAt,
        bookingItem.endAt,
        bookingItem.startAt,
        bookingItem.endAt,
        bookingItem.id,
        seededAt,
        seededAt
      ]),
      ...devCalendarSeedPlan.manualBlocks.map((manualBlock) => [
        manualBlock.reservationId,
        ownerUserId,
        scheduleId,
        "manual_block",
        "active",
        manualBlock.startAt,
        manualBlock.endAt,
        manualBlock.startAt,
        manualBlock.endAt,
        manualBlock.id,
        seededAt,
        seededAt
      ])
    ]
  );
  await insertMany(
    client,
    `insert into bookings
       (id, owner_user_id, client_user_id, product_id, reservation_id, source, state,
        service_start_at, service_end_at, product_title_snapshot, duration_minutes_snapshot,
        delivery_format_snapshot, price_minor_snapshot, currency_snapshot, time_zone_snapshot,
        policy_snapshot, created_at, updated_at)
     values`,
    devCalendarSeedPlan.bookings.map((bookingItem) => {
      const product = productById(bookingItem.productId);
      return [
        bookingItem.id,
        ownerUserId,
        bookingItem.clientUserId,
        bookingItem.productId,
        bookingItem.reservationId,
        bookingItem.source,
        "confirmed",
        bookingItem.startAt,
        bookingItem.endAt,
        product.title,
        product.durationMinutes,
        product.deliveryFormat,
        product.priceMinor,
        "RUB",
        devCalendarSeedPlan.ownerProfile.timeZone,
        JSON.stringify({
          seededBy: "packages/db/scripts/seed-dev-calendar.ts",
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          minimumNoticeMinutes: 0
        }),
        seededAt,
        seededAt
      ];
    })
  );
  await insertMany(
    client,
    `insert into manual_calendar_blocks
       (id, owner_user_id, reservation_id, title, state, created_at, updated_at)
     values`,
    devCalendarSeedPlan.manualBlocks.map((manualBlock) => [
      manualBlock.id,
      ownerUserId,
      manualBlock.reservationId,
      manualBlock.title,
      "active",
      seededAt,
      seededAt
    ])
  );
}

function booking(
  index: number,
  clientIndex: number,
  productIndex: number,
  source: SeedBooking["source"],
  startAt: string,
  endAt: string
): SeedBooking {
  return {
    id: `10000000-0000-4000-8000-0000000003${String(index).padStart(2, "0")}`,
    reservationId: `10000000-0000-4000-8000-0000000004${String(index).padStart(2, "0")}`,
    clientUserId: `10000000-0000-4000-8000-00000000010${clientIndex}`,
    productId: `10000000-0000-4000-8000-00000000020${productIndex}`,
    source,
    startAt,
    endAt
  };
}

function block(index: number, title: string, startAt: string, endAt: string): SeedManualBlock {
  return {
    id: `10000000-0000-4000-8000-0000000005${String(index).padStart(2, "0")}`,
    reservationId: `10000000-0000-4000-8000-0000000006${String(index).padStart(2, "0")}`,
    title,
    startAt,
    endAt
  };
}

function productById(productId: string): SeedProduct {
  const product = devCalendarSeedPlan.products.find((item) => item.id === productId);
  if (!product) throw new Error(`Unknown seed product: ${productId}`);
  return product;
}

async function insertMany(
  client: Queryable,
  prefix: string,
  rows: readonly (readonly unknown[])[]
): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders = rows.map((row) => {
    const rowPlaceholders = row.map((value) => {
      values.push(value);
      return `$${values.length}`;
    });
    return `(${rowPlaceholders.join(", ")})`;
  });
  await client.query(`${prefix} ${placeholders.join(", ")}`, values);
}

async function main(): Promise<void> {
  config({ path: resolve(currentDirectory, "../../../.env"), quiet: true });
  config({ path: resolve(currentDirectory, "../../../.env.example"), quiet: true });

  const { connectionString } = createPostgresConnectionConfig();
  assertDevelopmentDatabaseUrl(connectionString, process.env.NODE_ENV, "seed dev calendar data");

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await seedDevCalendar(client);
    await client.query("commit");
    console.log(
      `Dev calendar seed completed for ${result.ownerUserId}: ${result.clientCount} clients, ${result.productCount} products, ${result.bookingCount} bookings, ${result.manualBlockCount} manual blocks`
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint ? import.meta.url === pathToFileURL(entrypoint).href : false;
}

if (isDirectRun()) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
