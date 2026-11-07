export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Logger JSON mínimo e injetável. A biblioteca de log definitiva é [PENDENTE DE DEFINIÇÃO]. */
export function createConsoleLogger(level: LogLevel): Logger {
  const emit = (l: LogLevel, msg: string, data?: Record<string, unknown>) => {
    if (order[l] < order[level]) return;
    console[l](JSON.stringify({ level: l, msg, ...data }));
  };
  return {
    debug: (m, d) => emit("debug", m, d),
    info: (m, d) => emit("info", m, d),
    warn: (m, d) => emit("warn", m, d),
    error: (m, d) => emit("error", m, d),
  };
}
