import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { AppErrorBoundary } from '../../components/AppErrorBoundary';
import { renderWithProviders } from '../utils/renderWithProviders';

describe('AppErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders fallback when child throws and recovers after retry', () => {
    let shouldThrow = true;
    const Thrower = () => {
      if (shouldThrow) {
        throw new Error('Boom');
      }
      return <div>Safe content</div>;
    };

    const originalLocation = globalThis.location;
    const reloadSpy = vi.fn();
    const locationSpy = vi.spyOn(globalThis, 'location', 'get');
    locationSpy.mockReturnValue({
      ...originalLocation,
      reload: reloadSpy,
    } as Location);

    renderWithProviders(
      <AppErrorBoundary>
        <Thrower />
      </AppErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: 'Try again' });
    const reloadButton = screen.getByRole('button', { name: 'Reload page' });
    fireEvent.click(reloadButton);
    expect(reloadSpy).toHaveBeenCalled();

    shouldThrow = false;
    fireEvent.click(retryButton);

    expect(screen.getByText('Safe content')).toBeInTheDocument();

    locationSpy.mockRestore();
  });
});
