import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalsWorkspace } from '@/components/approvals/ApprovalsWorkspace';
import { resetAssistantStore, useAssistantStore } from '@/store/assistantStore';
import { jsonResponse, routeFetch, seedApprovals } from './helpers/fakeFetch';

beforeEach(() => resetAssistantStore());
afterEach(() => vi.unstubAllGlobals());

const decided = (id: string, status: string, reviewComment?: string) => ({
  item: {
    ...seedApprovals.find((i) => i.id === id)!,
    status,
    reviewedAt: '2026-11-01T10:00:00.000Z',
    ...(reviewComment ? { reviewComment } : {}),
  },
});

function setup(routes: Record<string, () => Response | Error> = {}) {
  const fetchFn = routeFetch({
    '/api/approvals': () => jsonResponse(200, { items: seedApprovals }),
    '/api/ai/greeting': () => jsonResponse(200, { greeting: 'Hello! 3 items left.', source: 'template' }),
    ...routes,
  });
  vi.stubGlobal('fetch', fetchFn);
  render(<ApprovalsWorkspace />);
  return { fetchFn, user: userEvent.setup() };
}

const bodyOf = (fetchFn: ReturnType<typeof routeFetch>, url: string) =>
  JSON.parse(String(fetchFn.mock.calls.find(([u]) => u === url)?.[1]?.body)) as Record<string, unknown>;

describe('review decisions', () => {
  it('approves the selected item after confirming, and updates the queue and the count', async () => {
    const { fetchFn, user } = setup({
      '/api/approvals/a1/decision': () => jsonResponse(200, decided('a1', 'approved')),
    });
    await screen.findByText('4 items');

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.click(screen.getByRole('button', { name: 'Confirm approval' }));

    expect(bodyOf(fetchFn, '/api/approvals/a1/decision')).toEqual({ decision: 'approve' });
    const row = (await screen.findAllByRole('row')).find((r) =>
      within(r).queryByText('Site Patrol Onboarding & Checklists'),
    );
    expect(within(row!).getByText('Approved')).toBeInTheDocument();
    expect(await screen.findByText('3 items')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('needs a comment before a rejection can be confirmed', async () => {
    const { fetchFn, user } = setup({
      '/api/approvals/a1/decision': () => jsonResponse(200, decided('a1', 'rejected', 'Wrong site.')),
    });
    await screen.findByText('4 items');

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    const confirm = screen.getByRole('button', { name: 'Confirm rejection' });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: /Comment to Sam/ }), 'Wrong site.');
    await user.click(confirm);

    expect(bodyOf(fetchFn, '/api/approvals/a1/decision')).toEqual({ decision: 'reject', comment: 'Wrong site.' });
  });

  it('drafts the comment with AI from the notes typed so far, and leaves it editable', async () => {
    const { fetchFn, user } = setup({
      '/api/ai/comment': () =>
        jsonResponse(200, { comment: 'Hi Sam, please remove the empty files and resubmit.', source: 'ai' }),
    });
    await screen.findByText('4 items');

    await user.click(screen.getByRole('button', { name: 'Request changes' }));
    const box = screen.getByRole('textbox', { name: /Comment to Sam/ });
    await user.type(box, 'empty files');
    await user.click(screen.getByRole('button', { name: 'Draft with AI' }));

    expect(bodyOf(fetchFn, '/api/ai/comment')).toEqual({
      itemId: 'a1',
      decision: 'request_changes',
      notes: 'empty files',
    });
    expect(await screen.findByDisplayValue('Hi Sam, please remove the empty files and resubmit.')).toBe(box);
    expect(screen.getByText('AI draft, check it before sending')).toBeInTheDocument();
  });

  it('shows an error and keeps the form when the decision fails', async () => {
    const { user } = setup({ '/api/approvals/a1/decision': () => jsonResponse(500, {}) });
    await screen.findByText('4 items');

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.click(screen.getByRole('button', { name: 'Confirm approval' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.getByRole('button', { name: 'Confirm approval' })).toBeInTheDocument();
  });

  it('refreshes the greeting after a decision, so the assistant shows the new count', async () => {
    const { fetchFn, user } = setup({
      '/api/approvals/a1/decision': () => jsonResponse(200, decided('a1', 'approved')),
    });
    await screen.findByText('4 items');

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.click(screen.getByRole('button', { name: 'Confirm approval' }));
    await screen.findByText('3 items');

    expect(fetchFn.mock.calls.some(([url]) => url === '/api/ai/greeting')).toBe(true);
    expect(useAssistantStore.getState().greeting.text).toBe('Hello! 3 items left.');
  });
});

describe('AI pre-review', () => {
  const review = (source: 'ai' | 'fallback') =>
    jsonResponse(200, {
      itemId: 'a1',
      deadline: 'Review within 72 hours',
      source,
      ...(source === 'fallback' ? { fallbackReason: 'no_api_key' } : {}),
      checks: [
        { check: 'Every file opens', why: 'Required for every folder.', chunkId: 'content-checks-by-type' },
        { check: 'No duplicate or empty files', why: 'Required for every folder.', chunkId: 'content-checks-by-type' },
      ],
    });

  it('shows the deadline and a checklist with the policy section for each check', async () => {
    const { user } = setup({ '/api/ai/review': () => review('ai') });
    await screen.findByText('4 items');

    await user.click(screen.getByRole('button', { name: 'AI pre-review' }));

    const list = await screen.findByRole('list', { name: 'Review checklist' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getAllByText('content-checks-by-type')).toHaveLength(2);
    expect(screen.getByText('Review within 72 hours')).toBeInTheDocument();
    expect(screen.queryByText('AI unavailable, showing a standard answer')).not.toBeInTheDocument();
  });

  it('marks the standard checklist when the AI was unavailable', async () => {
    const { user } = setup({ '/api/ai/review': () => review('fallback') });
    await screen.findByText('4 items');

    await user.click(screen.getByRole('button', { name: 'AI pre-review' }));

    expect(await screen.findByText('AI unavailable, showing a standard answer')).toBeInTheDocument();
  });
});
