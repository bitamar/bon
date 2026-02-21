import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import Header from '../../Header';
import { renderWithProviders } from '../utils/renderWithProviders';

describe('Header', () => {
  it('renders branding text', () => {
    renderWithProviders(<Header opened={false} toggle={vi.fn()} />);

    expect(screen.getByText('bon')).toBeInTheDocument();
  });

  it('calls toggle when burger is clicked', () => {
    const toggle = vi.fn();
    renderWithProviders(<Header opened={false} toggle={toggle} />);

    const burgerButton = screen
      .getAllByRole('button')
      .find((button) => button.className.includes('Burger'));
    if (!burgerButton) throw new Error('Burger button not found');
    fireEvent.click(burgerButton);
    expect(toggle).toHaveBeenCalledOnce();
  });
});
