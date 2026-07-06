import { randomUUID } from "node:crypto";
import { normalizeRequiredString } from "../shared";
import { VerificationValidationError } from "./verification-errors";
import type { VerificationApplicationStore } from "./verification-store";
import type {
  CurrentAstrologerVerification,
  SubmitAstrologerVerificationInput
} from "./verification-types";

export async function getCurrentAstrologerVerification(input: {
  readonly store: VerificationApplicationStore;
  readonly ownerUserId: string;
}): Promise<CurrentAstrologerVerification> {
  const ownerUserId = normalizeRequiredString(
    input.ownerUserId,
    "Verification owner user id is required"
  );
  const application = await input.store.findLatestByOwner({ ownerUserId });

  return {
    status: application?.status ?? "none",
    application
  };
}

export async function submitAstrologerVerificationApplication(input: {
  readonly store: VerificationApplicationStore;
  readonly ownerUserId: string;
  readonly input: SubmitAstrologerVerificationInput;
  readonly idGenerator?: () => string;
  readonly now: Date;
}) {
  const ownerUserId = normalizeRequiredString(
    input.ownerUserId,
    "Verification owner user id is required"
  );
  const identityDocumentMediaId = normalizeRequiredString(
    input.input.identityDocumentMediaId,
    "Identity document media id is required"
  );
  const qualificationDocumentMediaIds = input.input.qualificationDocumentMediaIds.map((mediaId) =>
    normalizeRequiredString(mediaId, "Qualification document media id is required")
  );

  if (qualificationDocumentMediaIds.length < 1 || qualificationDocumentMediaIds.length > 5) {
    throw new VerificationValidationError("Verification requires one to five qualification files");
  }
  if (new Set(qualificationDocumentMediaIds).size !== qualificationDocumentMediaIds.length) {
    throw new VerificationValidationError("Qualification document files must be unique");
  }
  if (qualificationDocumentMediaIds.includes(identityDocumentMediaId)) {
    throw new VerificationValidationError("Identity document cannot also be a qualification file");
  }

  const latest = await input.store.findLatestByOwner({ ownerUserId });
  if (latest?.status === "pending") {
    throw new VerificationValidationError("Verification application is already pending");
  }
  if (latest?.status === "approved") {
    throw new VerificationValidationError("Astrologer is already verified");
  }

  const idGenerator = input.idGenerator ?? randomUUID;
  const now = input.now.toISOString();
  return input.store.create({
    id: idGenerator(),
    ownerUserId,
    now,
    documents: [
      {
        id: idGenerator(),
        kind: "identity",
        mediaId: identityDocumentMediaId
      },
      ...qualificationDocumentMediaIds.map((mediaId) => ({
        id: idGenerator(),
        kind: "qualification" as const,
        mediaId
      }))
    ]
  });
}
