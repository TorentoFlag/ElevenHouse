import { describe, expect, it } from "vitest";
import { createLogger, type LogRecord } from "./index";

describe("createLogger", () => {
  it("writes structured log records through the provided sink", () => {
    const records: LogRecord[] = [];
    const logger = createLogger("public-api", (record) => records.push(record));

    logger.info("listening", { port: 3001 });

    expect(records).toEqual([
      {
        context: "public-api",
        level: "info",
        message: "listening",
        meta: { port: 3001 }
      }
    ]);
  });
});
