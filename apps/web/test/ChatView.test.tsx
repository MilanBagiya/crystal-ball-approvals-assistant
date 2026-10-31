import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { resetAssistantStore } from '@/store/assistantStore';
import { controllableStream, flush, jsonResponse, routeFetch, seedApprovals } from './helpers/fakeFetch';

// Drives the real panel into "Talk to me" with a fetch mock whose chat stream the test controls.
async function openTalk(chat: () => Response | Error) {
  const fetchFn = routeFetch({
    '/api/approvals': () => jsonResponse(200, { items: seedApprovals }),
    '/api/ai/greeting': () => jsonResponse(200, { greeting: 'Hello! You have 4 items waiting.', source: 'template' }),
    '/api/ai/chat': chat,
  });
  vi.stubGlobal('fetch', fetchFn);
  const user = userEvent.setup();
  render(<AssistantPanel />);
  await user.click(screen.getByRole('button', { name: /Talk to me/ }));
  await user.type(screen.getByRole('textbox', { name: 'Message' }), 'What should I review first?');
  await user.click(screen.getByRole('button', { name: 'Send' }));
  return { fetchFn, user };
}

beforeEach(() => resetAssistantStore());
afterEach(() => vi.unstubAllGlobals());

describe('ChatView', () => {
  it('shows typing dots before the first event arrives', async () => {
    await openTalk(() => controllableStream().response);

    expect(screen.getByText('What should I review first?')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Assistant is typing' })).toBeInTheDocument();
  });

  it('shows the reply growing as tokens stream in, with a caret until done', async () => {
    const stream = controllableStream();
    await openTalk(() => stream.response);

    stream.push({ type: 'token', text: 'Start with ' });
    expect(await screen.findByText('Start with')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Assistant is typing' })).not.toBeInTheDocument();
    expect(screen.getByTestId('streaming-caret')).toBeInTheDocument();

    stream.push({ type: 'token', text: 'the safety specs.' });
    expect(await screen.findByText('Start with the safety specs.')).toBeInTheDocument();

    stream.push({ type: 'done' });
    stream.close();
    await flush();
    expect(screen.queryByTestId('streaming-caret')).not.toBeInTheDocument();
  });

  it('puts the conversation in a polite live region for screen readers', async () => {
    await openTalk(() => controllableStream().response);

    expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows an error with Retry when the request fails, and Retry recovers', async () => {
    let calls = 0;
    const stream = controllableStream();
    const { user } = await openTalk(() => (++calls === 1 ? new TypeError('Failed to fetch') : stream.response));

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the assistant");

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    stream.push({ type: 'token', text: 'Back online.' });
    stream.push({ type: 'done' });
    stream.close();

    expect(await screen.findByText('Back online.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByText('What should I review first?')).toHaveLength(1); // the question isn't duplicated
  });

  it('shows the generic error for a 500', async () => {
    await openTalk(() => jsonResponse(500, { error: { code: 'internal_error', message: 'stack trace here' } }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.queryByText(/stack trace/)).not.toBeInTheDocument();
  });

  it('shows the rate-limit message for a 429', async () => {
    await openTalk(() => jsonResponse(429, { error: { code: 'rate_limited', message: 'x' } }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests, please wait a moment.');
  });

  it('shows a fallback notice followed by the standard answer', async () => {
    const stream = controllableStream();
    await openTalk(() => stream.response);

    stream.push({
      type: 'fallback',
      reason: 'timeout',
      content: "The assistant is unavailable right now. Here's the current queue in priority order:",
    });
    stream.push({ type: 'done' });
    stream.close();

    expect(await screen.findByText('AI unavailable, showing a standard answer')).toBeInTheDocument();
    expect(screen.getByText(/Here's the current queue in priority order/)).toBeInTheDocument();
  });

  it('offers suggested questions in an empty conversation and sends one when clicked', async () => {
    const stream = controllableStream();
    const fetchFn = routeFetch({
      '/api/approvals': () => jsonResponse(200, { items: seedApprovals }),
      '/api/ai/greeting': () => jsonResponse(200, { greeting: 'Hello!', source: 'template' }),
      '/api/ai/help': () => stream.response,
    });
    vi.stubGlobal('fetch', fetchFn);
    const user = userEvent.setup();
    render(<AssistantPanel />);
    await user.click(screen.getByRole('button', { name: /Help me/ }));

    await user.click(screen.getByRole('button', { name: 'Who do I escalate an expired calibration to?' }));

    expect(screen.getByText('Who do I escalate an expired calibration to?')).toBeInTheDocument();
    expect(JSON.parse(String(fetchFn.mock.calls.at(-1)?.[1]?.body))).toMatchObject({
      question: 'Who do I escalate an expired calibration to?',
    });
    // Suggestions disappear once the conversation has started.
    expect(screen.queryByRole('group', { name: 'Suggested questions' })).not.toBeInTheDocument();
  });

  it('shows **bold** from the model as bold text, without asterisks and without rendering HTML', async () => {
    const stream = controllableStream();
    await openTalk(() => stream.response);

    stream.push({ type: 'token', text: '1. **Check the deadline**: safety items <b>first</b>.' });
    stream.push({ type: 'done' });
    stream.close();

    const bold = await screen.findByText('Check the deadline');
    expect(bold.tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
    // Model text is never treated as HTML.
    expect(screen.getByText(/safety items <b>first<\/b>\./)).toBeInTheDocument();
  });

  it('disables Send while a reply is in progress', async () => {
    const { user } = await openTalk(() => controllableStream().response);

    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Another question');

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});
