export class AstroCalendarDomainError extends Error {
  constructor(
    public readonly code:
      | "ASTRO_CALENDAR_INVALID_RANGE"
      | "ASTRO_CALENDAR_FORBIDDEN_CLIENT_SCOPE"
      | "ASTRO_CALENDAR_UNSUPPORTED_GENERATION_MODE",
    message = code
  ) {
    super(message);
    this.name = "AstroCalendarDomainError";
  }
}
