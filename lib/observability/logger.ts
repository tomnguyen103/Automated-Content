import "server-only";

export type LogFields = Record<string, unknown>;
export type LogLevel = "debug" | "info" | "warn" | "error";

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function getMinimumLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL;

  if (configured === "debug" || configured === "info" || configured === "warn" || configured === "error") {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? "info" : "warn";
}

function normalizeFieldValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack
    };
  }

  return value;
}

function shouldLog(level: LogLevel) {
  if (process.env.NODE_ENV === "test" && process.env.OBSERVABILITY_TEST_LOGS !== "1") {
    return false;
  }

  return levelPriority[level] >= levelPriority[getMinimumLevel()];
}

function write(level: LogLevel, message: string, fields: LogFields = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, normalizeFieldValue(value)]))
  };
  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
}

export const logger = {
  debug(message: string, fields?: LogFields) {
    write("debug", message, fields);
  },
  info(message: string, fields?: LogFields) {
    write("info", message, fields);
  },
  warn(message: string, fields?: LogFields) {
    write("warn", message, fields);
  },
  error(message: string, fields?: LogFields) {
    write("error", message, fields);
  }
};
