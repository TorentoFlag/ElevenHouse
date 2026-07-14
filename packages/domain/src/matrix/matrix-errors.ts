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
