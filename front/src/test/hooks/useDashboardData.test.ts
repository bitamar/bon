import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { formatCurrency, formatRelativeTime, useDashboardData } from '../../hooks/useDashboardData';

describe('formatCurrency', () => {
  it('formats amount as ILS', () => {
    const formatted = formatCurrency(1234);
    expect(formatted).toContain('1,234');
  });
});

describe('formatRelativeTime', () => {
  it('returns "הרגע" for less than 1 minute ago', () => {
    expect(formatRelativeTime(new Date())).toBe('הרגע');
  });

  it('returns minutes for 5 minutes ago', () => {
    const date = new Date(Date.now() - 5 * 60_000);
    expect(formatRelativeTime(date)).toBe('לפני 5 דקות');
  });

  it('returns hours for 3 hours ago', () => {
    const date = new Date(Date.now() - 3 * 3_600_000);
    expect(formatRelativeTime(date)).toBe('לפני 3 שעות');
  });

  it('returns days for 2 days ago', () => {
    const date = new Date(Date.now() - 2 * 86_400_000);
    expect(formatRelativeTime(date)).toBe('לפני 2 ימים');
  });

  it('returns formatted date for more than 7 days ago', () => {
    const date = new Date(Date.now() - 10 * 86_400_000);
    const result = formatRelativeTime(date);
    expect(result).not.toContain('לפני');
  });
});

describe('useDashboardData', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in loading state and resolves with data after delay', async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useDashboardData());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();

    await act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeDefined();
    expect(result.current.data!.kpis).toHaveLength(4);
    expect(result.current.data!.recentInvoices).toHaveLength(5);
    expect(result.current.data!.activityItems).toHaveLength(5);
  });
});
