import { AnthropicLlmClient } from '../../src/llm/AnthropicLlmClient';
import { collect, request } from '../fakes/fakeLlm';

// Exercises the real @anthropic-ai/sdk code path with a fake fetch: no network, no API key needed.

interface FetchCall {
  url: string;
  body: Record<string, unknown>;
}

function fakeFetch(respond: () => Response) {
  const calls: FetchCall[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (init?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return respond();
  };
  return { fetch, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function sse(events: unknown[]): Response {
  const body = events
    .map((event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const message = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-5-5',
  content: [{ type: 'text', text: '{"greeting":"Hi"}' }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 42, output_tokens: 9 },
  ...overrides,
});

function streamOf(texts: string[], stopReason = 'end_turn') {
  return sse([
    {
      type: 'message_start',
      message: message({ content: [], stop_reason: null, usage: { input_tokens: 42, output_tokens: 1 } }),
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...texts.map((text) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 7 } },
    { type: 'message_stop' },
  ]);
}

function client(respond: () => Response) {
  const fake = fakeFetch(respond);
  const llm = new AnthropicLlmClient({ apiKey: 'test-key', model: 'claude-haiku-5-5', fetch: fake.fetch });
  return { llm, calls: fake.calls };
}

const signal = () => new AbortController().signal;

describe('AnthropicLlmClient.completeText', () => {
  it('sends the model, system prompt, messages and a low-latency config', async () => {
    const { llm, calls } = client(() => json(200, message()));

    await llm.completeText(request({ system: 'Be brief.', maxTokens: 200 }), signal());

    expect(calls[0]?.url).toMatch(/\/v1\/messages$/);
    expect(calls[0]?.body).toMatchObject({
      model: 'claude-haiku-5-5',
      system: 'Be brief.',
      max_tokens: 200,
      messages: [{ role: 'user', content: 'hi' }],
      // Short, latency-sensitive tasks: no thinking, low effort (both valid on Haiku 5.5).
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
    });
    expect(calls[0]?.body).not.toHaveProperty('temperature'); // sampling params are rejected by current models
  });

  it('returns the text and reports token usage', async () => {
    const { llm } = client(() => json(200, message()));
    const onUsage = jest.fn();

    await expect(llm.completeText(request({ onUsage }), signal())).resolves.toBe('{"greeting":"Hi"}');
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 42, outputTokens: 9 });
  });

  it('treats a refusal as an upstream error, so the caller falls back', async () => {
    const { llm } = client(() => json(200, message({ stop_reason: 'refusal', content: [] })));

    await expect(llm.completeText(request(), signal())).rejects.toMatchObject({ name: 'LlmError', kind: 'upstream' });
  });

  it('maps a rejected API key to a typed upstream error without leaking the key', async () => {
    const { llm } = client(() =>
      json(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
    );

    const error: unknown = await llm.completeText(request(), signal()).catch((e: unknown) => e);

    expect(error).toMatchObject({ name: 'LlmError', kind: 'upstream' });
    expect(String((error as Error).message)).not.toContain('test-key');
  });

  it('maps an aborted request to an aborted LlmError', async () => {
    const { llm } = client(() => json(200, message()));
    const controller = new AbortController();
    controller.abort();

    await expect(llm.completeText(request(), controller.signal)).rejects.toMatchObject({ kind: 'aborted' });
  });
});

describe('AnthropicLlmClient.streamText', () => {
  it('yields only the text deltas, in order', async () => {
    const { llm, calls } = client(() => streamOf(['Hel', 'lo', '!']));

    await expect(collect(llm.streamText(request(), signal()))).resolves.toEqual(['Hel', 'lo', '!']);
    expect(calls[0]?.body).toMatchObject({ stream: true });
  });

  it('reports input tokens from message_start and output tokens from message_delta', async () => {
    const { llm } = client(() => streamOf(['ok']));
    const onUsage = jest.fn();

    await collect(llm.streamText(request({ onUsage }), signal()));

    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 42, outputTokens: 7 });
  });

  it('fails after the partial text when the model refuses mid-stream', async () => {
    const { llm } = client(() => streamOf(['Partial'], 'refusal'));
    const received: string[] = [];

    const consume = async () => {
      for await (const chunk of llm.streamText(request(), signal())) received.push(chunk);
    };

    await expect(consume()).rejects.toMatchObject({ kind: 'upstream' });
    expect(received).toEqual(['Partial']);
  });
});
