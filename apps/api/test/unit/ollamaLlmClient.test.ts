import { OllamaLlmClient } from '../../src/llm/OllamaLlmClient';
import { collect, request } from '../fakes/fakeLlm';

// Ollama's HTTP API (POST /api/chat), faked at the fetch level: no Ollama install needed for these tests.

interface FetchCall {
  url: string;
  body: Record<string, unknown>;
}

function fakeFetch(respond: () => Response | Error) {
  const calls: FetchCall[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (init?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const result = respond();
    if (result instanceof Error) throw result;
    return result;
  };
  return { fetch, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** An NDJSON body delivered in arbitrary byte chunks, as a real stream would arrive. */
function ndjson(lines: unknown[], chunkSize = 7): Response {
  const text = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < text.length; i += chunkSize) controller.enqueue(encoder.encode(text.slice(i, i + chunkSize)));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
}

const piece = (content: string) => ({ message: { role: 'assistant', content }, done: false });
const final = {
  message: { role: 'assistant', content: '' },
  done: true,
  done_reason: 'stop',
  prompt_eval_count: 42,
  eval_count: 7,
};

function client(respond: () => Response | Error, baseUrl = 'http://localhost:11434') {
  const fake = fakeFetch(respond);
  const llm = new OllamaLlmClient({ baseUrl, model: 'qwen2.5:3b', fetch: fake.fetch });
  return { llm, calls: fake.calls };
}

const signal = () => new AbortController().signal;

describe('OllamaLlmClient.completeText', () => {
  it('posts the model, the system prompt as the first message, and the token limit', async () => {
    const { llm, calls } = client(() => json(200, { ...final, message: { role: 'assistant', content: 'Hi' } }));

    await llm.completeText(request({ system: 'Be brief.', maxTokens: 200 }), signal());

    expect(calls[0]?.url).toBe('http://localhost:11434/api/chat');
    expect(calls[0]?.body).toMatchObject({
      model: 'qwen2.5:3b',
      stream: false,
      messages: [
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'hi' },
      ],
      options: { num_predict: 200 },
    });
  });

  it('returns the reply text and reports token usage', async () => {
    const { llm } = client(() => json(200, { ...final, message: { role: 'assistant', content: '{"greeting":"Hi"}' } }));
    const onUsage = jest.fn();

    await expect(llm.completeText(request({ onUsage }), signal())).resolves.toBe('{"greeting":"Hi"}');
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 42, outputTokens: 7 });
  });

  it('tolerates a trailing slash in the base URL', async () => {
    const { llm, calls } = client(() => json(200, final), 'http://localhost:11434/');

    await llm.completeText(request(), signal());

    expect(calls[0]?.url).toBe('http://localhost:11434/api/chat');
  });

  it('explains how to fix a missing model', async () => {
    const { llm } = client(() => json(404, { error: "model 'qwen2.5:3b' not found" }));

    await expect(llm.completeText(request(), signal())).rejects.toMatchObject({
      name: 'LlmError',
      kind: 'upstream',
      message: expect.stringContaining('ollama pull qwen2.5:3b'),
    });
  });

  it('explains that Ollama is not running when the connection is refused', async () => {
    const { llm } = client(() => new TypeError('fetch failed'));

    await expect(llm.completeText(request(), signal())).rejects.toMatchObject({
      kind: 'upstream',
      message: expect.stringContaining("isn't reachable at http://localhost:11434"),
    });
  });

  it('maps an aborted request to an aborted LlmError', async () => {
    const { llm } = client(() => json(200, final));
    const controller = new AbortController();
    controller.abort();

    await expect(llm.completeText(request(), controller.signal)).rejects.toMatchObject({ kind: 'aborted' });
  });
});

describe('OllamaLlmClient.streamText', () => {
  it('yields each content piece in order, joining NDJSON lines split across chunks', async () => {
    const { llm, calls } = client(() => ndjson([piece('Hel'), piece('lo'), piece('!'), final], 5));

    await expect(collect(llm.streamText(request(), signal()))).resolves.toEqual(['Hel', 'lo', '!']);
    expect(calls[0]?.body).toMatchObject({ stream: true });
  });

  it('reports token usage from the final line', async () => {
    const { llm } = client(() => ndjson([piece('ok'), final]));
    const onUsage = jest.fn();

    await collect(llm.streamText(request({ onUsage }), signal()));

    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 42, outputTokens: 7 });
  });

  it('fails after the partial text when the stream reports an error', async () => {
    const { llm } = client(() => ndjson([piece('Partial'), { error: 'out of memory' }]));
    const received: string[] = [];

    const consume = async () => {
      for await (const chunk of llm.streamText(request(), signal())) received.push(chunk);
    };

    await expect(consume()).rejects.toMatchObject({ kind: 'upstream' });
    expect(received).toEqual(['Partial']);
  });
});

describe('OllamaLlmClient.isReachable', () => {
  // The health check asks Ollama for its model list: a cheap GET that needs no model loaded.
  const pinging = (respond: () => Response | Error) => {
    const urls: string[] = [];
    const fetch = async (input: string | URL | Request): Promise<Response> => {
      urls.push(String(input));
      const result = respond();
      if (result instanceof Error) throw result;
      return result;
    };
    return { llm: new OllamaLlmClient({ baseUrl: 'http://ollama.test/', model: 'qwen2.5:3b', fetch }), urls };
  };

  it('is true when Ollama lists its models', async () => {
    const { llm, urls } = pinging(() => json(200, { models: [] }));

    await expect(llm.isReachable(signal())).resolves.toBe(true);
    expect(urls).toEqual(['http://ollama.test/api/tags']);
  });

  it('is false when Ollama is not running', async () => {
    const { llm } = pinging(() => new TypeError('fetch failed'));

    await expect(llm.isReachable(signal())).resolves.toBe(false);
  });

  it('is false when Ollama answers with an error', async () => {
    const { llm } = pinging(() => json(500, { error: 'boom' }));

    await expect(llm.isReachable(signal())).resolves.toBe(false);
  });
});
