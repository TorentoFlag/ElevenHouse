export type RecordSavedCardSetupCreationCommand = Readonly<{ setupSessionId: string; providerSetupId: string }>;
export type SavedCardSetupCreationReceipt = Readonly<{ kind: "saved_card_setup_creation_receipt"; setupSessionId: string; setupSessionVersion: number; providerSetupId: string; state: "tokenization_required" }>;
export type SavedCardSetupResultUnitOfWork = Readonly<{ recordVerifiedCardSetupCreation(command: RecordSavedCardSetupCreationCommand): Promise<SavedCardSetupCreationReceipt> }>;
