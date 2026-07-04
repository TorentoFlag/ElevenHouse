export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaValidationError";
  }
}

export class MediaNotFoundError extends Error {
  constructor() {
    super("Media asset not found");
    this.name = "MediaNotFoundError";
  }
}

export class MediaStorageObjectMissingError extends Error {
  constructor() {
    super("Uploaded media object is missing");
    this.name = "MediaStorageObjectMissingError";
  }
}
