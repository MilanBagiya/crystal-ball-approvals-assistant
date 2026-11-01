import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HomePage from '@/app/page';
import { resetAssistantStore } from '@/store/assistantStore';
import { jsonResponse, routeFetch, seedApprovals } from './helpers/fakeFetch';

beforeEach(() => resetAssistantStore());
afterEach(() => vi.unstubAllGlobals());

describe('placeholder navigation', () => {
  // The demo has one page. Links to pages that don't exist are marked, so nothing looks broken.
  it.each(['Dashboard', 'Sites', 'Team', 'Reports', 'Back to Dashboard', 'HMS Panel'])(
    '"%s" is marked as not part of this demo and does nothing',
    async (name) => {
      vi.stubGlobal(
        'fetch',
        routeFetch({
          '/api/approvals': () => jsonResponse(200, { items: seedApprovals }),
          '/api/ai/greeting': () => jsonResponse(200, { greeting: 'Hello!', source: 'template' }),
          '/api/health': () => jsonResponse(200, { ok: true, llm: 'not_configured' }),
        }),
      );
      render(<HomePage />);
      await screen.findByText('4 items', { selector: 'span.rounded-full' });

      const control = screen.getByRole('button', { name: new RegExp(`^${name}`) });
      expect(control).toHaveAttribute('aria-disabled', 'true');
      expect(control).toHaveAccessibleDescription('Not part of this demo');

      const before = window.location.href;
      await userEvent.setup().click(control);
      expect(window.location.href).toBe(before);
    },
  );
});
