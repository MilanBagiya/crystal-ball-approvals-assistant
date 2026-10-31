import type { FallbackReason } from '@approvals/contracts';

export type LlmErrorKind = 'timeout' | 'unavailable' | 'upstream' | 'aborted';
export type UnavailableReason = Extract<FallbackReason, 'no_api_key' | 'forced'>;

export class LlmError extends Error {
  override name = 'LlmError';
  readonly unavailableReason: UnavailableReason | undefined;

  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    options: { unavailableReason?: UnavailableReason; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.unavailableReason = options.unavailableReason;
  }
}

// Anything that isn't a known timeout or a deliberate "unavailable" is reported as a generic LLM error.
export function toFallbackReason(error: unknown): FallbackReason {
  if (!(error instanceof LlmError)) return 'llm_error';
  if (error.kind === 'timeout') return 'timeout';
  if (error.kind === 'unavailable') return error.unavailableReason ?? 'llm_error';
  return 'llm_error';
}
