import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

vi.mock('../../api/subscriptions');

import { Subscription } from '../../pages/Subscription';
import * as subscriptionsApi from '../../api/subscriptions';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { Subscription as SubscriptionType } from '@bon/types/subscriptions';

function renderSubscription() {
  return renderWithProviders(
    <Routes>
      <Route path="/businesses/:businessId/subscription" element={<Subscription />} />
    </Routes>,
    { router: { initialEntries: ['/businesses/biz-1/subscription'] } }
  );
}

describe('Subscription page', () => {
  const fetchSubscriptionMock = vi.mocked(subscriptionsApi.fetchSubscription);
  const startTrialMock = vi.mocked(subscriptionsApi.startTrial);

  // ── helpers ──
  function makeSubscription(overrides: Partial<SubscriptionType> = {}): SubscriptionType {
    return {
      id: 'sub-1',
      businessId: 'biz-1',
      plan: 'monthly',
      status: 'active',
      meshulamCustomerId: null,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      trialEndsAt: null,
      cancelledAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows loading skeleton while fetching', () => {
    fetchSubscriptionMock.mockReturnValue(new Promise(() => {}));
    renderSubscription();
    expect(screen.getByTestId('form-skeleton')).toBeInTheDocument();
  });

  it('shows pricing plans when no subscription exists', async () => {
    fetchSubscriptionMock.mockResolvedValue({
      subscription: null,
      canCreateInvoices: false,
      daysRemaining: null,
    });

    renderSubscription();

    expect(await screen.findByText('בחרו תוכנית')).toBeInTheDocument();
    expect(screen.getByText('חודשי')).toBeInTheDocument();
    expect(screen.getByText('שנתי')).toBeInTheDocument();
  });

  it('shows plan features in pricing view', async () => {
    fetchSubscriptionMock.mockResolvedValue({
      subscription: null,
      canCreateInvoices: false,
      daysRemaining: null,
    });

    renderSubscription();

    await screen.findByText('בחרו תוכנית');
    expect(screen.getAllByText('חשבוניות ללא הגבלה')).toHaveLength(2);
    expect(screen.getAllByText('ניהול לקוחות')).toHaveLength(2);
  });

  it('shows start trial button when no subscription exists', async () => {
    fetchSubscriptionMock.mockResolvedValue({
      subscription: null,
      canCreateInvoices: false,
      daysRemaining: null,
    });
    startTrialMock.mockResolvedValue(undefined as never);

    renderSubscription();

    await screen.findByText('בחרו תוכנית');
    expect(screen.getByRole('button', { name: /ימי ניסיון חינם/ })).toBeInTheDocument();
  });

  it('shows active subscription status', async () => {
    fetchSubscriptionMock.mockResolvedValue({
      subscription: makeSubscription({ status: 'active', meshulamCustomerId: 'cust-1' }),
      canCreateInvoices: true,
      daysRemaining: 30,
    });

    renderSubscription();

    expect(await screen.findByText('מנוי חודשי')).toBeInTheDocument();
    expect(screen.getByText('פעיל')).toBeInTheDocument();
    expect(screen.getByText(/המנוי מתחדש בעוד 30 ימים/)).toBeInTheDocument();
  });

  it('shows cancel button for active subscription', async () => {
    fetchSubscriptionMock.mockResolvedValue({
      subscription: makeSubscription({ status: 'active', meshulamCustomerId: 'cust-1' }),
      canCreateInvoices: true,
      daysRemaining: 30,
    });

    renderSubscription();

    expect(await screen.findByRole('button', { name: 'ביטול מנוי' })).toBeInTheDocument();
  });

  it('shows trial state with upgrade card and days remaining', async () => {
    fetchSubscriptionMock.mockResolvedValue({
      subscription: makeSubscription({
        status: 'trialing',
        trialEndsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
        currentPeriodEnd: new Date(Date.now() + 14 * 86400000).toISOString(),
      }),
      canCreateInvoices: true,
      daysRemaining: 14,
    });

    renderSubscription();

    expect(await screen.findByText('שדרגו למנוי מלא')).toBeInTheDocument();
    expect(screen.getByText(/נותרו 14 ימים בתקופת הניסיון/)).toBeInTheDocument();
  });

  it('shows error state on fetch failure', async () => {
    fetchSubscriptionMock.mockRejectedValue(new Error('Network error'));

    renderSubscription();

    expect(await screen.findByText('שגיאה בטעינת נתוני המנוי')).toBeInTheDocument();
    expect(screen.getByText('נסו שוב')).toBeInTheDocument();
  });
});
