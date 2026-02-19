import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusCard } from '../../components/StatusCard';
import { renderWithProviders } from '../utils/renderWithProviders';

describe('StatusCard', () => {
  it('renders loading state with title and no primary action button', () => {
    renderWithProviders(<StatusCard status="loading" title="Loading data..." />);

    expect(screen.getByText('Loading data...')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders empty state with title and description and icon', () => {
    renderWithProviders(
      <StatusCard status="empty" title="No items found" description="Try adding some items." />
    );

    expect(screen.getByText('No items found')).toBeInTheDocument();
    expect(screen.getByText('Try adding some items.')).toBeInTheDocument();
    // ThemeIcon renders as a div container; icon SVG is present
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('renders error state with title', () => {
    renderWithProviders(<StatusCard status="error" title="Something went wrong" />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders notFound state with title', () => {
    renderWithProviders(<StatusCard status="notFound" title="Page not found" />);

    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });

  it('calls primaryAction.onClick when button is clicked', async () => {
    const handleClick = vi.fn();
    renderWithProviders(
      <StatusCard
        status="empty"
        title="No items"
        primaryAction={{ label: 'Add item', onClick: handleClick }}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders without crashing when align is start', () => {
    renderWithProviders(<StatusCard status="empty" title="Aligned start" align="start" />);

    expect(screen.getByText('Aligned start')).toBeInTheDocument();
  });
});
