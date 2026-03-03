import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { GlobalLoadingIndicator, useGlobalLoading } from '../../components/GlobalLoadingIndicator';
import { renderWithProviders } from '../utils/renderWithProviders';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useIsFetching: vi.fn(),
    useIsMutating: vi.fn(),
  };
});

const useIsFetchingMock = vi.mocked(useIsFetching);
const useIsMutatingMock = vi.mocked(useIsMutating);

function LoadingConsumer() {
  const busy = useGlobalLoading();
  return <span>{busy ? 'busy' : 'idle'}</span>;
}

describe('GlobalLoadingIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useIsFetchingMock.mockReset();
    useIsMutatingMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports loading state after show delay when there are active queries', () => {
    useIsFetchingMock.mockReturnValue(1);
    useIsMutatingMock.mockReturnValue(0);

    renderWithProviders(
      <GlobalLoadingIndicator>
        <LoadingConsumer />
      </GlobalLoadingIndicator>
    );

    // Not visible immediately (show delay of 120ms)
    expect(screen.getByText('idle')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(screen.getByText('busy')).toBeInTheDocument();
  });

  it('renders a progress bar when visible', () => {
    useIsFetchingMock.mockReturnValue(1);
    useIsMutatingMock.mockReturnValue(0);

    renderWithProviders(
      <GlobalLoadingIndicator>
        <LoadingConsumer />
      </GlobalLoadingIndicator>
    );

    const progressBar = screen.getByRole('progressbar', { hidden: true });
    expect(progressBar).toBeInTheDocument();

    // Initially hidden
    expect(progressBar).toHaveAttribute('aria-hidden', 'true');

    act(() => {
      vi.advanceTimersByTime(120);
    });

    // Visible after show delay
    expect(progressBar).toHaveAttribute('aria-hidden', 'false');
  });

  it('delays clearing the loading state after activity stops', () => {
    useIsFetchingMock.mockReturnValueOnce(1).mockReturnValue(0);
    useIsMutatingMock.mockReturnValue(0);

    const { rerender } = renderWithProviders(
      <GlobalLoadingIndicator>
        <LoadingConsumer />
      </GlobalLoadingIndicator>
    );

    // Advance past show delay
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.getByText('busy')).toBeInTheDocument();

    // Rerender with no active queries
    act(() => {
      rerender(
        <GlobalLoadingIndicator>
          <LoadingConsumer />
        </GlobalLoadingIndicator>
      );
    });

    // Still busy due to 300ms hide delay
    expect(screen.getByText('busy')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText('idle')).toBeInTheDocument();
  });
});
