import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';
import { resetAssistantStore } from '@/store/assistantStore';
import { jsonResponse, routeFetch, seedApprovals } from './helpers/fakeFetch';

beforeEach(() => resetAssistantStore());
afterEach(() => vi.unstubAllGlobals());

describe('home page', () => {
  it('has one page heading and composes the queue with the assistant panel', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        '/api/approvals': () => jsonResponse(200, { items: seedApprovals }),
        '/api/ai/greeting': () => jsonResponse(200, { greeting: 'Hello!', source: 'template' }),
      }),
    );

    render(<HomePage />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Approvals & Review' })).toBeInTheDocument();
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Approvals assistant' })).toBeInTheDocument();
  });
});
