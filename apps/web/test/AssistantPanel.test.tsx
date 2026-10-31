import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { resetAssistantStore } from '@/store/assistantStore';
import { jsonResponse, routeFetch, seedApprovals } from './helpers/fakeFetch';

function setup() {
  const fetchFn = routeFetch({
    '/api/approvals': () => jsonResponse(200, { items: seedApprovals }),
    '/api/ai/greeting': () =>
      jsonResponse(200, { greeting: 'Good morning! You have 4 items waiting for review.', source: 'ai' }),
  });
  vi.stubGlobal('fetch', fetchFn);
  render(<AssistantPanel />);
  return { fetchFn, user: userEvent.setup() };
}

const greetingCalls = (fetchFn: ReturnType<typeof routeFetch>) =>
  fetchFn.mock.calls.filter(([url]) => url === '/api/ai/greeting').length;

beforeEach(() => resetAssistantStore());
afterEach(() => vi.unstubAllGlobals());

describe('AssistantPanel', () => {
  it('renders the header, the greeting, the four action cards and the item count', async () => {
    setup();
    const panel = screen.getByRole('dialog', { name: 'Approvals assistant' });

    expect(within(panel).getByRole('heading', { name: 'Approvals' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Close assistant' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Replay Greeting' })).toBeInTheDocument();
    for (const name of ['Present me Summary', 'Talk to me', 'Help me', 'Teach me']) {
      expect(within(panel).getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(await within(panel).findByText('Good morning! You have 4 items waiting for review.')).toBeInTheDocument();
    expect(await within(panel).findByText('4 items')).toBeInTheDocument();
  });

  it('closes with the X button and reopens from the floating button', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Close assistant' }));

    expect(screen.queryByRole('dialog', { name: 'Approvals assistant' })).not.toBeInTheDocument();
    const reopen = screen.getByRole('button', { name: 'Open Approvals assistant' });

    await user.click(reopen);

    expect(screen.getByRole('dialog', { name: 'Approvals assistant' })).toBeInTheDocument();
  });

  it('replays the greeting on demand', async () => {
    const { fetchFn, user } = setup();
    await screen.findByText(/Good morning!/);

    await user.click(screen.getByRole('button', { name: 'Replay Greeting' }));

    expect(greetingCalls(fetchFn)).toBe(2);
  });

  it('opens an action view with a back button, and moves focus between views', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: /Talk to me/ }));

    const heading = screen.getByRole('heading', { name: 'Talk to me' });
    expect(heading).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to home' }));

    expect(screen.getByRole('button', { name: /Present me Summary/ })).toBeInTheDocument();
  });
});
