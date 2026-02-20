import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { RouteErrorBoundary } from '../../components/RouteErrorBoundary';
import { renderWithProviders } from '../utils/renderWithProviders';

const { resetQueriesMock, useQueryClientMock } = vi.hoisted(() => {
  const resetQueriesMock = vi.fn();
  const useQueryClientMock = vi.fn(() => ({ resetQueries: resetQueriesMock }));
  return { resetQueriesMock, useQueryClientMock };
});

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: useQueryClientMock,
  };
});

describe('RouteErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    resetQueriesMock.mockReset();
    useQueryClientMock.mockClear();
    useQueryClientMock.mockImplementation(() => ({ resetQueries: resetQueriesMock }));
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('resets query cache and recovers after retry', () => {
    let shouldThrow = true;
    const Thrower = () => {
      if (shouldThrow) {
        throw new Error('Route failed');
      }
      return <div>Loaded content</div>;
    };

    const originalLocation = globalThis.location;
    const reloadSpy = vi.fn();
    const locationSpy = vi.spyOn(globalThis, 'location', 'get');
    locationSpy.mockReturnValue({
      ...originalLocation,
      reload: reloadSpy,
    } as Location);

    renderWithProviders(
      <RouteErrorBoundary>
        <Thrower />
      </RouteErrorBoundary>
    );

    expect(screen.getByText('משהו השתבש')).toBeInTheDocument();
    expect(screen.getByText('Route failed')).toBeInTheDocument();
    expect(useQueryClientMock).toHaveBeenCalled();

    const retryButton = screen.getByRole('button', { name: 'נסה שוב' });
    const reloadButton = screen.getByRole('button', { name: 'טען מחדש' });
    fireEvent.click(reloadButton);
    expect(reloadSpy).toHaveBeenCalled();

    shouldThrow = false;
    fireEvent.click(retryButton);

    expect(resetQueriesMock).toHaveBeenCalled();
    expect(screen.getByText('Loaded content')).toBeInTheDocument();

    locationSpy.mockRestore();
  });
});
