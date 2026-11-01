import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalsWorkspace } from '@/components/approvals/ApprovalsWorkspace';
import { resetAssistantStore } from '@/store/assistantStore';
import { jsonResponse, routeFetch, seedApprovals } from './helpers/fakeFetch';

beforeEach(() => resetAssistantStore());
afterEach(() => vi.unstubAllGlobals());

function setup(searchResponse?: object) {
  const fetchFn = routeFetch({
    '/api/approvals': () => jsonResponse(200, { items: seedApprovals }),
    '/api/ai/search': () => jsonResponse(200, searchResponse ?? {}),
  });
  vi.stubGlobal('fetch', fetchFn);
  render(<ApprovalsWorkspace />);
  return { fetchFn, user: userEvent.setup() };
}

const rowTitles = () =>
  within(screen.getByRole('table'))
    .getAllByRole('button', { name: /^Select / })
    .map((b) => b.textContent);
const searchCalls = (fetchFn: ReturnType<typeof routeFetch>) =>
  fetchFn.mock.calls.filter(([url]) => url === '/api/ai/search').length;

describe('AI search', () => {
  it('turns a sentence into filter chips on Enter, and shows only the matches', async () => {
    const { fetchFn, user } = setup({
      query: 'videos still pending',
      filter: { types: ['video'], statuses: ['pending_review'] },
      itemIds: ['a2'],
      source: 'ai',
    });
    await screen.findByRole('table');

    await user.type(screen.getByRole('searchbox', { name: 'Search approvals' }), 'videos still pending{Enter}');

    expect(await screen.findByRole('group', { name: 'AI filter' })).toHaveTextContent('Video');
    expect(screen.getByRole('group', { name: 'AI filter' })).toHaveTextContent('Pending review');
    expect(rowTitles()).toEqual(['Level 2 Drone Patrol Video Demo']);
    expect(JSON.parse(String(fetchFn.mock.calls.at(-1)?.[1]?.body))).toEqual({ query: 'videos still pending' });
  });

  it('clears the AI filter and shows the whole queue again', async () => {
    const { user } = setup({ query: 'images', filter: { types: ['image'] }, itemIds: ['a4'], source: 'ai' });
    await screen.findByRole('table');

    await user.type(screen.getByRole('searchbox', { name: 'Search approvals' }), 'show me images{Enter}');
    await screen.findByRole('group', { name: 'AI filter' });
    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(rowTitles()).toHaveLength(4);
    expect(screen.queryByRole('group', { name: 'AI filter' })).not.toBeInTheDocument();
  });

  it('keeps one-word searches local: no AI call', async () => {
    const { fetchFn, user } = setup();
    await screen.findByRole('table');

    await user.type(screen.getByRole('searchbox', { name: 'Search approvals' }), 'elena{Enter}');

    expect(searchCalls(fetchFn)).toBe(0);
    expect(rowTitles()).toEqual(['360° Spatial Zone Layout & Camera Map']);
  });

  it('says when the AI was unavailable and a keyword match was used instead', async () => {
    const { user } = setup({
      query: 'videos from Alex',
      filter: { text: 'videos from Alex' },
      itemIds: [],
      source: 'keyword',
      fallbackReason: 'no_api_key',
    });
    await screen.findByRole('table');

    await user.type(screen.getByRole('searchbox', { name: 'Search approvals' }), 'videos from Alex{Enter}');

    expect(await screen.findByText('AI unavailable, used a keyword match')).toBeInTheDocument();
  });
});
