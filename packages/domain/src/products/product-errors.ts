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
