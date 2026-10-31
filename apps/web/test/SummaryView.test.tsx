import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { resetAssistantStore } from '@/store/assistantStore';
import { controllableStream, jsonResponse, routeFetch, seedApprovals } from './helpers/fakeFetch';

beforeEach(() => resetAssistantStore());
afterEach(() => vi.unstubAllGlobals());

async function openSummary() {
  const stream = controllableStream();
  vi.stubGlobal(
    'fetch',
    routeFetch({
      '/api/approvals': () => jsonResponse(200, { items: seedApprovals }),
      '/api/ai/greeting': () => jsonResponse(200, { greeting: 'Hello!', source: 'template' }),
      '/api/ai/summary': () => stream.response,
    }),
  );
  render(<AssistantPanel />);
  await screen.findByText('4 items');
  await userEvent.setup().click(screen.getByRole('button', { name: /Present me Summary/ }));
  return stream;
}

describe('SummaryView', () => {
  it('shows a loading skeleton, then the headline and items with their titles in rank order', async () => {
    const stream = await openSummary();
    expect(screen.getByRole('status', { name: 'Loading summary' })).toBeInTheDocument();

    stream.push({ type: 'summary_headline', text: 'Start with the safety specs.', pendingCount: 4, source: 'ai' });
    stream.push({ type: 'summary_item', id: 'a2', rank: 2, urgency: 'medium', reason: 'Patrol demo.', source: 'ai' });
    stream.push({ type: 'summary_item', id: 'a3', rank: 1, urgency: 'high', reason: '24h SLA.', source: 'ai' });

    expect(await screen.findByText('Start with the safety specs.')).toBeInTheDocument();
    const items = await screen.findAllByRole('listitem');
    expect(items.map((li) => within(li).getByRole('heading').textContent)).toEqual([
      'Safety Equipment & Sensor Specs',
      'Level 2 Drone Patrol Video Demo',
    ]);
    expect(within(items[0]!).getByText('high')).toBeInTheDocument();
  });

  it('marks fallback items and shows the fallback notice', async () => {
    const stream = await openSummary();

    stream.push({
      type: 'fallback',
      reason: 'timeout',
      content: '1 of 4 items were filled in from the standard ranking.',
    });
    stream.push({
      type: 'summary_item',
      id: 'a3',
      rank: 1,
      urgency: 'high',
      reason: 'Safety content.',
      source: 'fallback',
    });
    stream.push({ type: 'done' });
    stream.close();

    expect(await screen.findByText('AI unavailable, showing a standard answer')).toBeInTheDocument();
    expect(screen.getByText('Standard ranking')).toBeInTheDocument();
  });

  it('uses a gentler notice when the AI wrote part of the summary', async () => {
    const stream = await openSummary();

    stream.push({ type: 'summary_item', id: 'a3', rank: 1, urgency: 'high', reason: 'AI reason.', source: 'ai' });
    stream.push({ type: 'fallback', reason: 'invalid_output', content: 'The headline was filled in.' });
    stream.push({
      type: 'summary_headline',
      text: '4 items are pending review.',
      pendingCount: 4,
      source: 'fallback',
    });
    stream.push({ type: 'done' });
    stream.close();

    expect(await screen.findByText('Some parts are standard answers')).toBeInTheDocument();
    expect(screen.queryByText('AI unavailable, showing a standard answer')).not.toBeInTheDocument();
  });
});

describe('Read aloud', () => {
  // jsdom has no speech engine, so the Web Speech API is faked here.
  function fakeSpeech() {
    const spoken: { text: string; lang: string }[] = [];
    class FakeUtterance {
      lang = '';
      onend: (() => void) | null = null;
      constructor(public text: string) {}
    }
    const synth = {
      speak: vi.fn((u: FakeUtterance) => spoken.push({ text: u.text, lang: u.lang })),
      cancel: vi.fn(),
    };
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', synth);
    return { spoken, synth };
  }

  async function finishedSummary() {
    const stream = await openSummary();
    stream.push({ type: 'summary_headline', text: 'Start with the safety specs.', pendingCount: 4, source: 'ai' });
    stream.push({ type: 'summary_item', id: 'a3', rank: 1, urgency: 'high', reason: '24h SLA.', source: 'ai' });
    stream.push({ type: 'done' });
    stream.close();
    return screen.findByRole('button', { name: 'Read aloud' });
  }

  it('reads the headline and each item, in the browser language', async () => {
    const { spoken } = fakeSpeech();
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-IN');

    await userEvent.setup().click(await finishedSummary());

    expect(spoken).toHaveLength(1);
    expect(spoken[0]?.lang).toBe('en-IN');
    expect(spoken[0]?.text).toContain('Start with the safety specs.');
    expect(spoken[0]?.text).toContain('1. Safety Equipment & Sensor Specs, high urgency. 24h SLA.');
    vi.restoreAllMocks();
  });

  it('turns into a Stop button while speaking, and stops when pressed', async () => {
    const { synth } = fakeSpeech();
    const user = userEvent.setup();

    await user.click(await finishedSummary());
    await user.click(screen.getByRole('button', { name: 'Stop reading' }));

    expect(synth.cancel).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Read aloud' })).toBeInTheDocument();
  });

  it('is not offered when the browser cannot speak', async () => {
    const stream = await openSummary();
    stream.push({ type: 'summary_headline', text: 'Start with the safety specs.', pendingCount: 4, source: 'ai' });
    stream.push({ type: 'done' });
    stream.close();

    await screen.findByText('Start with the safety specs.');
    expect(screen.queryByRole('button', { name: 'Read aloud' })).not.toBeInTheDocument();
  });
});
