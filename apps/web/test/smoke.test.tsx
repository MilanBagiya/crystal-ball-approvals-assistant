import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

describe('web scaffold', () => {
  it('renders the page heading', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { name: 'Approvals & Review' })).toBeInTheDocument();
  });
});
