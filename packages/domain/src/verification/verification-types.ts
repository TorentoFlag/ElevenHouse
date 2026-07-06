export type VerificationApplicationStatus = "pending" | "approved" | "rejected" | "revoked";

export type AstrologerVerificationStatus = "none" | VerificationApplicationStatus;

export type VerificationDocumentKind = "identity" | "qualification";

export type VerificationDocument = {
  readonly id: string;
  readonly applicationId: string;
  readonly kind: VerificationDocumentKind;
  readonly mediaId: string;
  readonly originalFileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
};

export type AstrologerVerificationApplication = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly status: VerificationApplicationStatus;
  readonly rejectionReason: string | null;
  readonly submittedAt: string;
  readonly reviewedAt: string | null;
  readonly reviewerUserId: string | null;
  readonly documents: readonly VerificationDocument[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SubmitAstrologerVerificationInput = {
  readonly identityDocumentMediaId: string;
  readonly qualificationDocumentMediaIds: readonly string[];
};

export type CurrentAstrologerVerification = {
  readonly status: AstrologerVerificationStatus;
  readonly application: AstrologerVerificationApplication | null;
};
