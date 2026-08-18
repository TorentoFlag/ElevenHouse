import type { AstroDiaryMoodId } from "@elevenhouse/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  createClientAstroDiaryEntryDraft,
  publishClientAstroDiaryEntryDraft,
  updateClientAstroDiaryEntryDraft
} from "../api/astroDiaryApi";
import { createAstroDiaryCommandAttemptRegistry } from "./astroDiaryCommandAttemptRegistry";
import {
  invalidateClientAstroDiaryDraftSave,
  invalidateClientAstroDiaryPublish
} from "./astroDiaryQueries";

export type ClientAstroDiaryEntryDraftState = Readonly<{
  draftId: string;
  version: number;
  body: string;
  moodId: AstroDiaryMoodId | null;
}>;

export type SaveClientAstroDiaryEntryInput = Readonly<{
  journalId: string;
  expectedJournalVersion: number;
  body: string;
  moodId: AstroDiaryMoodId | null;
  draft: ClientAstroDiaryEntryDraftState | null;
}>;

export type PublishClientAstroDiaryEntryInput = Readonly<{
  journalId: string;
  expectedJournalVersion: number;
  draft: ClientAstroDiaryEntryDraftState;
}>;

export function useClientAstroDiaryEntryMutations() {
  const queryClient = useQueryClient();
  const attempts = useMemo(() => createAstroDiaryCommandAttemptRegistry(), []);
  const save = useMutation({
    mutationFn: async (input: SaveClientAstroDiaryEntryInput) => {
      const intent = {
        journalId: input.journalId,
        expectedJournalVersion: input.expectedJournalVersion,
        draftId: input.draft?.draftId ?? null,
        expectedDraftVersion: input.draft?.version ?? null,
        body: input.body,
        moodId: input.moodId
      };
      const idempotencyKey = attempts.acquire("save", intent);
      const result = input.draft
        ? await updateClientAstroDiaryEntryDraft({
            journalId: input.journalId,
            draftId: input.draft.draftId,
            idempotencyKey,
            body: {
              expectedJournalVersion: input.expectedJournalVersion,
              expectedDraftVersion: input.draft.version,
              body: input.body,
              attachmentIds: [],
              moodId: input.moodId
            }
          })
        : await createClientAstroDiaryEntryDraft({
            journalId: input.journalId,
            idempotencyKey,
            body: {
              expectedJournalVersion: input.expectedJournalVersion,
              body: input.body,
              attachmentIds: [],
              moodId: input.moodId
            }
          });
      return {
        draft: {
          draftId: result.draftId,
          version: result.version,
          body: input.body,
          moodId: input.moodId
        },
        idempotencyKey
      };
    },
    onSuccess: async ({ idempotencyKey }, input) => {
      attempts.acknowledge("save", idempotencyKey);
      await invalidateClientAstroDiaryDraftSave(queryClient, input.journalId);
    }
  });

  const publish = useMutation({
    mutationFn: async (input: PublishClientAstroDiaryEntryInput) => {
      const intent = {
        journalId: input.journalId,
        expectedJournalVersion: input.expectedJournalVersion,
        draftId: input.draft.draftId,
        expectedDraftVersion: input.draft.version
      };
      const idempotencyKey = attempts.acquire("publish", intent);
      const result = await publishClientAstroDiaryEntryDraft({
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
      await invalidateClientAstroDiaryPublish(queryClient, input.journalId);
    }
  });

  return { save, publish };
}
