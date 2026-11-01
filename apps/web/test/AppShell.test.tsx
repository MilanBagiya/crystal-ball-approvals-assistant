import { ApprovalItemSchema } from '@approvals/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HomePage from '@/app/page';
import { HEALTH_POLL_MS } from '@/components/layout/AppShell';
import { resetAssistantStore, useAssistantStore } from '@/store/assistantStore';
import { jsonResponse, routeFetch, seedApprovals } from './helpers/fakeFetch';

beforeEach(() => resetAssistantStore());
afterEach(() => vi.unstubAllGlobals());

function renderHome(extra: Record<string, () => Response | Error> = {}) {
  const fetchFn = routeFetch({
    '/api/approvals': () => jsonResponse(200, { items: seedApprovals }),
    '/api/ai/greeting': () => jsonResponse(200, { greeting: 'Hello!', source: 'template' }),
    '/api/health': () => jsonResponse(200, { ok: true, llm: 'not_configured' }),
    ...extra,
  });
  vi.stubGlobal('fetch', fetchFn);
  render(<HomePage />);
  return { fetchFn, user: userEvent.setup() };
}

describe('branding', () => {
  it('names the project in the top bar and the footer', async () => {
    renderHome();
    await screen.findByRole('table');

    expect(screen.getByText('Crystal Ball')).toBeInTheDocument();
    expect(screen.getByText('Command Centre')).toBeInTheDocument();
    expect(screen.getByText(/Approvals AI Assistant/)).toBeInTheDocument();
    expect(screen.queryByText(/Digital Twin/)).not.toBeInTheDocument();
  });
});

describe('AI status', () => {
  it('says the AI is unreachable when the provider is down', async () => {
    renderHome({ '/api/health': () => jsonResponse(200, { ok: true, llm: 'unreachable' }) });

    expect(await screen.findByText('AI unreachable: standard answers')).toBeInTheDocument();
  });

  it('checks again on its own, so stopping or starting the model shows without a reload', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let llm = 'configured';
      renderHome({ '/api/health': () => jsonResponse(200, { ok: true, llm }) });
      expect(await screen.findByText('AI connected')).toBeInTheDocument();

      llm = 'unreachable';
      await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS);

      expect(await screen.findByText('AI unreachable: standard answers')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('navigation', () => {
  it('links to the Dashboard from the sidebar and from "Back to Dashboard"', async () => {
    renderHome();
    await screen.findByRole('table');

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /Back to Dashboard/ })).toHaveAttribute('href', '/dashboard');
  });

  // The demo has two pages. Links to pages that don't exist are marked, so nothing looks broken.
  it.each(['Sites', 'Team', 'Reports', 'HMS Panel'])(
    '"%s" is marked as not part of this demo and does nothing',
    async (name) => {
      const { user } = renderHome();
      await screen.findByRole('table');

      const control = screen.getByRole('button', { name: new RegExp(`^${name}`) });
      expect(control).toHaveAttribute('aria-disabled', 'true');
      expect(control).toHaveAccessibleDescription('Not part of this demo');

      const before = window.location.href;
      await user.click(control);
      expect(window.location.href).toBe(before);
    },
  );
});

describe('Reset demo data', () => {
  it('puts every item back to pending', async () => {
    const decided = ApprovalItemSchema.array().parse(
      seedApprovals.map((item, i) => (i === 0 ? { ...item, status: 'approved' } : item)),
    );
    const { fetchFn, user } = renderHome({ '/api/approvals/reset': () => jsonResponse(200, { items: seedApprovals }) });
    await screen.findByRole('table');
    useAssistantStore.setState({ approvals: { items: decided, status: 'done' } });

    await user.click(screen.getByRole('button', { name: 'Reset demo data' }));

    expect(fetchFn.mock.calls.some(([url, init]) => url === '/api/approvals/reset' && init?.method === 'POST')).toBe(
      true,
    );
    expect(useAssistantStore.getState().approvals.items.every((i) => i.status === 'pending_review')).toBe(true);
  });
});
