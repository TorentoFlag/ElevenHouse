import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createAstroDiaryReplyDraft,
  publishAstroDiaryReplyDraft,
  updateAstroDiaryReplyDraft
} from "../api/astroDiaryApi";
import { createAstroDiaryCommandAttemptRegistry } from "./astroDiaryCommandAttemptRegistry";
import {
  invalidateAstroDiaryJournal,
  invalidateAstroDiaryReplyDraftSave
} from "./astroDiaryQueries";

export type AstroDiaryReplyDraftState = Readonly<{
  draftId: string;
  version: number;
  body: string;
}>;

export type SaveAstroDiaryReplyInput = Readonly<{
  journalId: string;
  expectedJournalVersion: number;
  body: string;
  draft: AstroDiaryReplyDraftState | null;
}>;

export type PublishAstroDiaryReplyInput = Readonly<{
  journalId: string;
  expectedJournalVersion: number;
  draft: AstroDiaryReplyDraftState;
}>;

export function useAstroDiaryReplyMutations() {
  const queryClient = useQueryClient();
  const attempts = useMemo(() => createAstroDiaryCommandAttemptRegistry(), []);

  const save = useMutation({
    mutationFn: async (input: SaveAstroDiaryReplyInput) => {
      const intent = {
        journalId: input.journalId,
        expectedJournalVersion: input.expectedJournalVersion,
        body: input.body,
        draftId: input.draft?.draftId ?? null,
        expectedDraftVersion: input.draft?.version ?? null
      };
      const idempotencyKey = attempts.acquire("save", intent);
      const result = input.draft
        ? await updateAstroDiaryReplyDraft({
            journalId: input.journalId,
            draftId: input.draft.draftId,
            idempotencyKey,
            body: {
              expectedJournalVersion: input.expectedJournalVersion,
              expectedDraftVersion: input.draft.version,
              body: input.body,
              attachmentIds: []
            }
          })
        : await createAstroDiaryReplyDraft({
            journalId: input.journalId,
            idempotencyKey,
            body: {
              expectedJournalVersion: input.expectedJournalVersion,
              body: input.body,
              attachmentIds: []
            }
          });
      return {
        draft: { draftId: result.draftId, version: result.version, body: input.body },
        idempotencyKey
      };
    },
    onSuccess: async ({ idempotencyKey }, input) => {
      attempts.acknowledge("save", idempotencyKey);
      await invalidateAstroDiaryReplyDraftSave(queryClient, input.journalId);
    }
  });

  const publish = useMutation({
    mutationFn: async (input: PublishAstroDiaryReplyInput) => {
      const intent = {
        journalId: input.journalId,
        expectedJournalVersion: input.expectedJournalVersion,
        draftId: input.draft.draftId,
        expectedDraftVersion: input.draft.version
      };
      const idempotencyKey = attempts.acquire("publish", intent);
      const result = await publishAstroDiaryReplyDraft({
        journalId: input.journalId,
        draftId: input.draft.draftId,
        idempotencyKey,
        body: {
          expectedJournalVersion: input.expectedJournalVersion,
          expectedDraftVersion: input.draft.version
        }
      });
      return { result, idempotencyKey };
    },
    onSuccess: async ({ idempotencyKey }, input) => {
      attempts.acknowledge("publish", idempotencyKey);
      await invalidateAstroDiaryJournal(queryClient, input.journalId);
    }
  });

  return { save, publish };
}
