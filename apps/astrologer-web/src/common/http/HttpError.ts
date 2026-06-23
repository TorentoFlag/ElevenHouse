export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown
  ) {
    super(`HTTP request failed with status ${status}`);
    this.name = "HttpError";
  }
}
