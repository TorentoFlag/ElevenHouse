export class CalculationPdfNotFoundError extends Error {
  constructor() {
    super("Calculation PDF was not found");
    this.name = "CalculationPdfNotFoundError";
  }
}

export class CalculationPdfNotReadyError extends Error {
  constructor() {
    super("Calculation PDF is not ready");
    this.name = "CalculationPdfNotReadyError";
  }
}

export class CalculationPdfResultChangedError extends Error {
  constructor() {
    super("Calculation result changed; reload and retry");
    this.name = "CalculationPdfResultChangedError";
  }
}
