export class ProductNotFoundError extends Error {
  constructor() {
    super("Product not found");
  }
}

export class ProductValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class ProductRevisionConflictError extends Error {
  readonly code = "PRODUCT_REVISION_CONFLICT" as const;

  constructor(
    readonly expectedRevision: number,
    readonly currentRevision: number
  ) {
    super("Product revision conflict");
    this.name = "ProductRevisionConflictError";
  }
}

export class ProductFulfillmentNotReadyError extends Error {
  readonly code = "PRODUCT_FULFILLMENT_NOT_READY" as const;

  constructor() {
    super("AstroDiary subscription fulfillment is not ready");
  }
}

export class ProductTemplateNotFoundError extends Error {
  constructor() {
    super("Product template not found");
  }
}

export class ProductTemplateValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}
