import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { resetAssistantStore, useAssistantStore } from '@/store/assistantStore';
import { jsonResponse, routeFetch, seedApprovals } from './helpers/fakeFetch';

beforeEach(() => resetAssistantStore());
afterEach(() => vi.unstubAllGlobals());

const dashboard = {
  generatedAt: '2026-09-19T12:00:00.000Z',
  counts: { pending_review: 3, approved: 1, changes_requested: 0, rejected: 0, total: 4 },
  pendingByType: { folder: 1, video: 1, pdf: 0, image: 1 },
  deadlines: [
    {
      id: 'a2',
      title: 'Level 2 Drone Patrol Video Demo',
      type: 'video',
      urgency: 'medium',
      dueAt: '2026-09-21T00:00:00.000Z',
      hoursLeft: -60,
      overdue: true,
    },
    {
      id: 'a1',
      title: 'Site Patrol Onboarding & Checklists',
      type: 'folder',
      urgency: 'medium',
      dueAt: '2026-09-21T00:00:00.000Z',
      hoursLeft: 5,
      overdue: false,
    },
  ],
  recentDecisions: [{ ...seedApprovals[2], status: 'approved', reviewedAt: '2026-09-19T11:00:00.000Z' }],
};

function setup(briefing = { briefing: '3 items wait; 1 is overdue by 2 days.', source: 'ai' }) {
  vi.stubGlobal(
    'fetch',
    routeFetch({
      '/api/dashboard': () => jsonResponse(200, dashboard),
      '/api/ai/briefing': () => jsonResponse(200, briefing),
    }),
  );
  render(<DashboardView />);
  return userEvent.setup();
}

describe('DashboardView', () => {
  it('shows the counts by status', async () => {
    setup();

    const stats = await screen.findByRole('list', { name: 'Queue status' });
    expect(within(stats).getByText('Pending').nextSibling).toHaveTextContent('3');
    expect(within(stats).getByText('Approved').nextSibling).toHaveTextContent('1');
  });

  it('lists deadlines with how late or how soon each item is', async () => {
    setup();

    const deadlines = await screen.findByRole('list', { name: 'Deadlines' });
    const rows = within(deadlines).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Level 2 Drone Patrol Video Demo');
    expect(rows[0]).toHaveTextContent('2 days overdue');
    expect(rows[1]).toHaveTextContent('Due in 5 hours');
  });

  it('opens an item on the Approvals page from its deadline', async () => {
    const user = setup();

    const deadlines = await screen.findByRole('list', { name: 'Deadlines' });
    const review = within(deadlines).getAllByRole('link', { name: /^Review/ })[0]!;
    await user.click(review);

    expect(review).toHaveAttribute('href', '/');
    expect(useAssistantStore.getState().selectedId).toBe('a2');
  });

  it('shows pending items by type and the latest decisions', async () => {
    setup();

    expect(await screen.findByRole('list', { name: 'Pending by type' })).toHaveTextContent('Video1');
    expect(screen.getByRole('list', { name: 'Recent decisions' })).toHaveTextContent('Safety Equipment & Sensor Specs');
  });

  it('shows the AI briefing, labelled as AI', async () => {
    setup();

    const card = await screen.findByRole('region', { name: 'Daily briefing' });
    expect(await within(card).findByText('3 items wait; 1 is overdue by 2 days.')).toBeInTheDocument();
    expect(within(card).getByText('AI')).toBeInTheDocument();
  });

  it('labels a template briefing as standard', async () => {
    setup({ briefing: '3 items are waiting for review.', source: 'template' });

    const card = await screen.findByRole('region', { name: 'Daily briefing' });
    expect(await within(card).findByText('Standard')).toBeInTheDocument();
  });
});
