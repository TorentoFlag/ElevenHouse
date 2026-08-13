import { astroDiaryDraftReviewPromptV1 } from "../prompts/astro-diary-draft-review.v1";
import { astroDiaryReflectionQuestionDraftPromptV1 } from "../prompts/astro-diary-question-draft.v1";
import { astroDiaryReplyDraftPromptV1 } from "../prompts/astro-diary-reply-draft.v1";
import { createPromptRegistry } from "./prompt-registry";

export const astroDiaryPromptRegistry = createPromptRegistry([
  astroDiaryReplyDraftPromptV1,
  astroDiaryReflectionQuestionDraftPromptV1,
  astroDiaryDraftReviewPromptV1
]);
