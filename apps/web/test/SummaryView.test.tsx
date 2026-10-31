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
});
