import { z } from "@elevenhouse/validation";

const InstagramGraphMessageValueSchema = z.object({
  sender: z.object({ id: z.union([z.string(), z.number()]).transform(String) }),
  recipient: z.object({ id: z.union([z.string(), z.number()]).transform(String) }),
  timestamp: z.union([z.string(), z.number()]).optional(),
  message: z
    .object({
      mid: z.union([z.string(), z.number()]).transform(String),
      text: z.string().optional()
    })
    .passthrough()
    .optional()
});

const InstagramGraphWebhookSchema = z.object({
  object: z.literal("instagram"),
  entry: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).transform(String),
      changes: z
        .array(
          z.object({
            field: z.string(),
            value: z.unknown()
          })
        )
        .optional(),
      messaging: z
        .array(
          InstagramGraphMessageValueSchema
        )
        .optional()
    })
  )
});

const InstagramGraphMessagesTestWebhookSchema = z.object({
  field: z.literal("messages"),
  value: InstagramGraphMessageValueSchema
});

export type ParsedInstagramGraphWebhookUpdate = {
  readonly kind: "message";
  readonly instagramAccountId: string;
  readonly providerMessageId: string;
  readonly senderId: string;
  readonly recipientId: string;
  readonly text: string;
  readonly providerSentAt: string;
};

export function parseInstagramGraphWebhookUpdates(
  body: unknown
): readonly ParsedInstagramGraphWebhookUpdate[] {
  const testPayload = InstagramGraphMessagesTestWebhookSchema.safeParse(body);
  if (testPayload.success) {
    const update = instagramGraphMessageValueToUpdate(
      testPayload.data.value.recipient.id,
      testPayload.data.value
    );
    return update ? [update] : [];
  }

  const parsed = InstagramGraphWebhookSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("Invalid Instagram Graph webhook payload");
  }

  const updates: ParsedInstagramGraphWebhookUpdate[] = [];
  for (const entry of parsed.data.entry) {
    for (const event of entry.messaging ?? []) {
      const update = instagramGraphMessageValueToUpdate(entry.id, event);
      if (update) updates.push(update);
    }
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const messageValue = InstagramGraphMessageValueSchema.safeParse(change.value);
      if (!messageValue.success) continue;
      const update = instagramGraphMessageValueToUpdate(entry.id, messageValue.data);
      if (update) updates.push(update);
    }
  }

  return updates;
}

function instagramGraphMessageValueToUpdate(
  instagramAccountId: string,
  value: z.infer<typeof InstagramGraphMessageValueSchema>
): ParsedInstagramGraphWebhookUpdate | null {
  const message = value.message;
  const text = message?.text?.trim();
  if (!message || !text) return null;
  return {
    kind: "message",
    instagramAccountId,
    providerMessageId: message.mid,
    senderId: value.sender.id,
    recipientId: value.recipient.id,
    text,
    providerSentAt: instagramGraphTimestampToIso(value.timestamp)
  };
}

function instagramGraphTimestampToIso(timestamp: number | string | undefined): string {
  if (timestamp === undefined) return new Date().toISOString();
  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp)) return new Date().toISOString();
  const milliseconds =
    numericTimestamp < 1_000_000_000_000 ? numericTimestamp * 1000 : numericTimestamp;
  return new Date(milliseconds).toISOString();
}
