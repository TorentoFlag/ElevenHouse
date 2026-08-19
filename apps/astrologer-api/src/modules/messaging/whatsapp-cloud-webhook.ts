import { z } from "@elevenhouse/validation";

const StringishSchema = z.union([z.string(), z.number()]).transform(String);

const WhatsAppCloudContactSchema = z
  .object({
    wa_id: StringishSchema,
    profile: z
      .object({
        name: z.string().trim().min(1).optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

const WhatsAppCloudMessageSchema = z
  .object({
    from: StringishSchema,
    to: StringishSchema.optional(),
    id: StringishSchema,
    timestamp: StringishSchema.optional(),
    type: z.string().trim().min(1),
    text: z
      .object({
        body: z.string()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

const WhatsAppCloudStatusSchema = z
  .object({
    id: StringishSchema,
    status: z.string().trim().min(1),
    timestamp: StringishSchema.optional(),
    recipient_id: StringishSchema.optional()
  })
  .passthrough();

const WhatsAppCloudMessagesValueSchema = z
  .object({
    messaging_product: z.literal("whatsapp").optional(),
    metadata: z
      .object({
        phone_number_id: StringishSchema.optional(),
        display_phone_number: StringishSchema.optional()
      })
      .passthrough()
      .optional(),
    contacts: z.array(WhatsAppCloudContactSchema).optional().default([]),
    messages: z.array(WhatsAppCloudMessageSchema).optional().default([]),
    message_echoes: z.array(WhatsAppCloudMessageSchema).optional().default([]),
    statuses: z.array(WhatsAppCloudStatusSchema).optional().default([])
  })
  .passthrough();

const WhatsAppCloudAccountUpdateValueSchema = z
  .object({
    event: StringishSchema.optional(),
    type: StringishSchema.optional(),
    status: StringishSchema.optional(),
    reason: StringishSchema.optional(),
    timestamp: StringishSchema.optional(),
    metadata: z
      .object({
        phone_number_id: StringishSchema.optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

const WhatsAppCloudWebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      id: StringishSchema,
      changes: z
        .array(
          z.object({
            field: z.string().trim().min(1),
            value: z.unknown()
          })
        )
        .min(1)
    })
  )
});

export type ParsedWhatsAppCloudWebhookChange = {
  readonly field: string;
  readonly wabaId: string;
  readonly phoneNumberId: string | null;
  readonly displayPhoneNumber: string | null;
  readonly contacts: readonly {
    readonly waId: string;
    readonly displayName: string | null;
  }[];
  readonly messages: readonly {
    readonly id: string;
    readonly from: string;
    readonly type: string;
    readonly text: string | null;
    readonly providerSentAt: string;
  }[];
  readonly echoes: readonly {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly type: string;
    readonly text: string | null;
    readonly providerSentAt: string;
  }[];
  readonly statuses: readonly {
    readonly id: string;
    readonly status: string;
    readonly recipientId: string | null;
    readonly providerSentAt: string;
  }[];
  readonly accountUpdate: {
    readonly event: string;
    readonly reason: string | null;
    readonly eventAt: string;
  } | null;
  readonly syncEvents: readonly {
    readonly kind: "history" | "contact_sync";
    readonly keyPart: string;
    readonly action: string;
    readonly timestamp: string;
    readonly summary: Readonly<Record<string, unknown>>;
  }[];
};

export function parseWhatsAppCloudWebhookChanges(
  body: unknown
): readonly ParsedWhatsAppCloudWebhookChange[] {
  const parsed = WhatsAppCloudWebhookSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("Invalid WhatsApp Cloud webhook payload");
  }

  return parsed.data.entry.flatMap((entry) =>
    entry.changes.map((change) => {
      const value = WhatsAppCloudMessagesValueSchema.safeParse(change.value);
      return {
        field: change.field,
        wabaId: entry.id,
        phoneNumberId: value.success
          ? (value.data.metadata?.phone_number_id ?? null)
          : accountUpdatePhoneNumberId(change.value),
        displayPhoneNumber: value.success
          ? (value.data.metadata?.display_phone_number ?? null)
          : null,
        contacts: value.success
          ? value.data.contacts.map((contact) => ({
              waId: contact.wa_id,
              displayName: contact.profile?.name ?? null
            }))
          : [],
        messages:
          value.success && change.field === "messages"
            ? value.data.messages.map(whatsAppCloudMessageToUpdate)
            : [],
        echoes:
          value.success && change.field === "smb_message_echoes"
            ? value.data.message_echoes.map(whatsAppCloudEchoToUpdate).filter(isNotNull)
            : [],
        statuses: value.success ? value.data.statuses.map(whatsAppCloudStatusToUpdate) : [],
        accountUpdate: change.field === "account_update" ? parseAccountUpdate(change.value) : null,
        syncEvents: parseSyncEvents(change.field, change.value)
      };
    })
  );
}

function whatsAppCloudEchoToUpdate(
  message: z.infer<typeof WhatsAppCloudMessageSchema>
): ParsedWhatsAppCloudWebhookChange["echoes"][number] | null {
  if (!message.to) return null;
  const text = message.text?.body.trim();
  return {
    id: message.id,
    from: message.from,
    to: message.to,
    type: message.type,
    text: text ? text : null,
    providerSentAt: whatsAppCloudTimestampToIso(message.timestamp)
  };
}

function whatsAppCloudMessageToUpdate(
  message: z.infer<typeof WhatsAppCloudMessageSchema>
): ParsedWhatsAppCloudWebhookChange["messages"][number] {
  const text = message.text?.body.trim();
  return {
    id: message.id,
    from: message.from,
    type: message.type,
    text: text ? text : null,
    providerSentAt: whatsAppCloudTimestampToIso(message.timestamp)
  };
}

function whatsAppCloudStatusToUpdate(
  status: z.infer<typeof WhatsAppCloudStatusSchema>
): ParsedWhatsAppCloudWebhookChange["statuses"][number] {
  return {
    id: status.id,
    status: status.status,
    recipientId: status.recipient_id ?? null,
    providerSentAt: whatsAppCloudTimestampToIso(status.timestamp)
  };
}

function whatsAppCloudTimestampToIso(timestamp: string | undefined): string {
  if (timestamp === undefined) return new Date().toISOString();
  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp)) return new Date().toISOString();
  const milliseconds =
    numericTimestamp < 1_000_000_000_000 ? numericTimestamp * 1000 : numericTimestamp;
  return new Date(milliseconds).toISOString();
}

function parseAccountUpdate(
  value: unknown
): ParsedWhatsAppCloudWebhookChange["accountUpdate"] {
  const parsed = WhatsAppCloudAccountUpdateValueSchema.safeParse(value);
  if (!parsed.success) return null;
  const event = parsed.data.event ?? parsed.data.type ?? parsed.data.status;
  if (!event) return null;
  return {
    event,
    reason: parsed.data.reason ?? null,
    eventAt: whatsAppCloudTimestampToIso(parsed.data.timestamp)
  };
}

function accountUpdatePhoneNumberId(value: unknown): string | null {
  const parsed = WhatsAppCloudAccountUpdateValueSchema.safeParse(value);
  return parsed.success ? (parsed.data.metadata?.phone_number_id ?? null) : null;
}

function parseSyncEvents(
  field: string,
  value: unknown
): ParsedWhatsAppCloudWebhookChange["syncEvents"] {
  if (field !== "history" && field !== "smb_app_state_sync") return [];
  const records = isRecord(value) ? value : {};
  const candidates = [
    ...(Array.isArray(records.history) ? records.history : []),
    ...(Array.isArray(records.state_sync) ? records.state_sync : []),
    ...(Array.isArray(records.sync) ? records.sync : []),
    ...(Array.isArray(records.contacts) ? records.contacts : [])
  ];
  const source = candidates.length > 0 ? candidates : [records];
  return source.map((item, index) => {
    const record = isRecord(item) ? item : {};
    const action = readString(record.action) ?? readString(record.type) ?? "received";
    const timestamp = whatsAppCloudTimestampToIso(readString(record.timestamp));
    const keyPart =
      readString(record.id) ??
      readString(record.message_id) ??
      readNestedString(record.contact, "wa_id") ??
      readString(record.wa_id) ??
      String(index);
    return {
      kind: field === "history" ? "history" : "contact_sync",
      keyPart,
      action,
      timestamp,
      summary: {
        action,
        type: readString(record.type) ?? null,
        hasContact: isRecord(record.contact),
        hasMessages: Array.isArray(record.messages)
      }
    };
  });
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function readNestedString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  return readString(value[key]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}
