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
