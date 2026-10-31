import { render, screen, within } from '@testing-library/react';
import { ApprovalsTable } from '@/components/approvals/ApprovalsTable';
import { resetAssistantStore } from '@/store/assistantStore';
import { jsonResponse, routeFetch, seedApprovals } from './helpers/fakeFetch';

beforeEach(() => resetAssistantStore());
afterEach(() => vi.unstubAllGlobals());

describe('ApprovalsTable', () => {
  it('lists the queue from /api/approvals with an item count badge', async () => {
    vi.stubGlobal('fetch', routeFetch({ '/api/approvals': () => jsonResponse(200, { items: seedApprovals }) }));

    render(<ApprovalsTable />);

    expect(await screen.findByText('4 items')).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1); // skip the header row
    // Each row's first cell holds the title (as a select button) with its folder path underneath.
    expect(rows.map((row) => within(row).getByRole('button', { name: /^Select / }).textContent)).toEqual(
      seedApprovals.map((item) => item.title),
    );
    expect(within(rows[1]!).getByText('Drawing-Videos › Drawing-Videos Card')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Pending review')).toBeInTheDocument();
  });

  it('shows an error instead of an empty table when the queue cannot be loaded', async () => {
    vi.stubGlobal('fetch', routeFetch({ '/api/approvals': () => new TypeError('Failed to fetch') }));

    render(<ApprovalsTable />);

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the approvals queue.");
  });
});
