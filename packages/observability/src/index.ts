export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogRecord = {
  readonly context: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly meta?: Record<string, unknown>;
};

export type LogSink = (record: LogRecord) => void;

export type Logger = {
  readonly debug: (message: string, meta?: Record<string, unknown>) => void;
  readonly info: (message: string, meta?: Record<string, unknown>) => void;
  readonly warn: (message: string, meta?: Record<string, unknown>) => void;
  readonly error: (message: string, meta?: Record<string, unknown>) => void;
};

const defaultSink: LogSink = (record) => {
  console.log(JSON.stringify(record));
};

export function createLogger(context: string, sink: LogSink = defaultSink): Logger {
  const write = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    sink({ context, level, message, meta });
  };

  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta)
  };
}
