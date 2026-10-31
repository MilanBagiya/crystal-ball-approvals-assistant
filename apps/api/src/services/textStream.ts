import type { ChatMessage, StreamEvent } from '@approvals/contracts';
import { toFallbackReason } from '../llm/errors';

/**
 * Forwards model text as token events. If the model fails (no key, timeout, error), the text already
 * sent stays and a fallback event with the deterministic answer follows.
 */
export async function* tokensWithFallback(
  modelChunks: AsyncIterable<string>,
  fallbackContent: () => string,
): AsyncGenerator<StreamEvent, void, undefined> {
  try {
    for await (const text of modelChunks) {
      if (text) yield { type: 'token', text };
    }
  } catch (error) {
    yield { type: 'fallback', reason: toFallbackReason(error), content: fallbackContent() };
  }
}

/** The Messages API expects the conversation to start with a user turn, so leading assistant turns are dropped. */
export function fromFirstUserTurn(messages: readonly ChatMessage[]): ChatMessage[] {
  const first = messages.findIndex((m) => m.role === 'user');
  return first === -1 ? [] : messages.slice(first);
}
