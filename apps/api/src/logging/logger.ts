// Structured app events (rejected model lines, fallbacks, unhandled errors) as one JSON line each.
// LLM token usage has its own logger (llm/usageLog.ts).

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  event: string;
  [field: string]: unknown;
}

export interface Logger {
  log(entry: LogEntry): void;
}

export function createJsonLogger(write: (line: string) => void = (line) => console.log(line)): Logger {
  return {
    log: (entry) => write(JSON.stringify({ at: new Date().toISOString(), ...entry })),
  };
}

export function serializeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) };
  }
  return { name: 'NonError', message: String(error) };
}
