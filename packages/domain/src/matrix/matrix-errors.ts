export class MatrixValidationError extends Error {
  readonly code = "MATRIX_VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "MatrixValidationError";
  }
}

export class UnsupportedMatrixMethodError extends Error {
  readonly code = "MATRIX_METHOD_UNSUPPORTED";

  constructor(methodCode: string) {
    super(`Unsupported Matrix method: ${methodCode}`);
    this.name = "UnsupportedMatrixMethodError";
  }
}

export class MatrixNoteNotFoundError extends Error {
  readonly code = "MATRIX_NOTE_NOT_FOUND";

  constructor() {
    super("Matrix note was not found");
    this.name = "MatrixNoteNotFoundError";
  }
}

export class MatrixResultChangedError extends Error {
  readonly code = "MATRIX_RESULT_CHANGED";

  constructor() {
    super("Matrix result changed while the operation was in progress");
    this.name = "MatrixResultChangedError";
  }
}

export class MatrixReportNotFoundError extends Error {
  readonly code = "MATRIX_REPORT_NOT_FOUND";

  constructor() {
    super("Matrix report was not found");
    this.name = "MatrixReportNotFoundError";
  }
}

export class MatrixReportNotReadyError extends Error {
  readonly code = "MATRIX_REPORT_NOT_READY";

  constructor() {
    super("Matrix report must be ready before PDF generation");
    this.name = "MatrixReportNotReadyError";
  }
}

export class MatrixReportStaleError extends Error {
  readonly code = "MATRIX_REPORT_STALE";

  constructor() {
    super("Matrix report is stale and must be reviewed before PDF generation");
    this.name = "MatrixReportStaleError";
  }
}
