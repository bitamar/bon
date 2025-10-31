import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
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
  let timeoutSpy: MockInstance<typeof global.setTimeout>;

  beforeEach(() => {
    vi.useFakeTimers();
    timeoutSpy = vi.spyOn(global, 'setTimeout');
    useIsFetchingMock.mockReset();
    useIsMutatingMock.mockReset();
  });

  afterEach(() => {
    timeoutSpy.mockRestore();
    vi.useRealTimers();
  });

  it('reports loading state while there are active queries or mutations', () => {
    useIsFetchingMock.mockReturnValue(1);
    useIsMutatingMock.mockReturnValue(0);

    renderWithProviders(
      <GlobalLoadingIndicator>
        <LoadingConsumer />
      </GlobalLoadingIndicator>
    );

    expect(screen.getByText('busy')).toBeInTheDocument();
  });

  it('delays clearing the loading state after activity stops', () => {
    useIsFetchingMock.mockReturnValueOnce(1).mockReturnValue(0);
    useIsMutatingMock.mockReturnValue(0);

    const { rerender } = renderWithProviders(
      <GlobalLoadingIndicator>
        <LoadingConsumer />
      </GlobalLoadingIndicator>
    );
    expect(screen.getByText('busy')).toBeInTheDocument();

    act(() => {
      rerender(
        <GlobalLoadingIndicator>
          <LoadingConsumer />
        </GlobalLoadingIndicator>
      );
    });

    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 300);

    act(() => {
      vi.runAllTimers();
    });

    expect(screen.getByText('idle')).toBeInTheDocument();
  });
});
