import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { Application, application } from "./Application";
import { HttpClient } from "./common/http/HttpClient";

describe("Application", () => {
  it("exposes the public API HTTP client", () => {
    const application = new Application();

    expect(application.http).toBeInstanceOf(HttpClient);
  });

  it("exports the runtime application instance", () => {
    expect(application).toBeInstanceOf(Application);
    expect(application.http).toBeInstanceOf(HttpClient);
  });

  it("exposes the server-state query client", () => {
    const application = new Application();

    expect(application.queryClient).toBeInstanceOf(QueryClient);
  });
});
