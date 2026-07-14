import type { MatrixNote } from "./matrix-note-types";

export type MatrixNoteStore = {
  readonly listByCalculation: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
  }) => Promise<readonly MatrixNote[]>;
  readonly create: (input: {
    readonly id: string;
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly text: string;
    readonly resultChecksum: string;
    readonly now: string;
  }) => Promise<MatrixNote>;
  readonly update: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly noteId: string;
    readonly text: string;
    readonly resultChecksum: string;
    readonly now: string;
  }) => Promise<MatrixNote | null>;
  readonly delete: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly noteId: string;
  }) => Promise<boolean>;
};
