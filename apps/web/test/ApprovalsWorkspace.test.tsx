import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalsWorkspace } from '@/components/approvals/ApprovalsWorkspace';
import { resetAssistantStore, useAssistantStore } from '@/store/assistantStore';
import { controllableStream, jsonResponse, routeFetch, seedApprovals } from './helpers/fakeFetch';

beforeEach(() => resetAssistantStore());
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const fetchFn = routeFetch({
    '/api/approvals': () => jsonResponse(200, { items: seedApprovals }),
    '/api/ai/chat': () => controllableStream().response,
  });
  vi.stubGlobal('fetch', fetchFn);
  render(<ApprovalsWorkspace />);
  return { fetchFn, user: userEvent.setup() };
}

const rowTitles = () =>
  within(screen.getByRole('table'))
    .getAllByRole('button', { name: /^Select / })
    .map((b) => b.textContent);

describe('ApprovalsWorkspace', () => {
  it('shows the first item in the detail pane by default', async () => {
    setup();

    const detail = await screen.findByRole('region', { name: 'Site Patrol Onboarding & Checklists' });
    expect(within(detail).getByText('Sam HelpAdmin')).toBeInTheDocument();
  });

  it('shows the details of the row the user selects', async () => {
    const { user } = setup();

    await user.click(await screen.findByRole('button', { name: 'Select Safety Equipment & Sensor Specs' }));

    expect(screen.getByRole('region', { name: 'Safety Equipment & Sensor Specs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select Safety Equipment & Sensor Specs' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('filters the queue by title, author or folder as the user types', async () => {
    const { user } = setup();
    await screen.findByRole('table');
    const search = screen.getByRole('searchbox', { name: 'Search approvals' });

    await user.type(search, 'elena');
    expect(rowTitles()).toEqual(['360° Spatial Zone Layout & Camera Map']);

    await user.clear(search);
    await user.type(search, 'drawing-videos');
    expect(rowTitles()).toEqual(['Level 2 Drone Patrol Video Demo']);

    await user.clear(search);
    await user.type(search, 'nothing matches this');
    expect(screen.getByText('No approvals match "nothing matches this".')).toBeInTheDocument();
  });

  it('asks the assistant about the selected item', async () => {
    const { fetchFn, user } = setup();
    useAssistantStore.setState({ isOpen: false });

    await user.click(await screen.findByRole('button', { name: 'Ask the assistant about this item' }));

    expect(useAssistantStore.getState()).toMatchObject({ isOpen: true, view: 'talk' });
    const body = JSON.parse(String(fetchFn.mock.calls.at(-1)?.[1]?.body)) as { messages: { content: string }[] };
    expect(body.messages.at(-1)?.content).toContain('Site Patrol Onboarding & Checklists');
  });
});
