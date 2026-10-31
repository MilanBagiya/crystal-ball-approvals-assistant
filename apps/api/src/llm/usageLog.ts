// One JSON line per LLM call: the raw material for token-cost governance (grep, ship to a log pipeline, sum).

export type LlmOutcome = 'ok' | 'timeout' | 'error' | 'unavailable' | 'aborted' | 'fallback';

export interface UsageRecord {
  promptId: string;
  promptVersion: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  outcome: LlmOutcome;
  /** Optional detail, e.g. why a service fell back. */
  detail?: string;
}

export type UsageLogger = (record: UsageRecord) => void;

export function createConsoleUsageLogger(write: (line: string) => void = (line) => console.log(line)): UsageLogger {
  return (record) => write(JSON.stringify({ event: 'llm_call', at: new Date().toISOString(), ...record }));
}
