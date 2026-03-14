import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

vi.mock('../../api/subscriptions');

import { Subscription } from '../../pages/Subscription';
import * as subscriptionsApi from '../../api/subscriptions';
import { renderWithProviders } from '../utils/renderWithProviders';

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

  beforeEach(() => {
    vi.resetAllMocks();
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

  it('shows active subscription status', async () => {
    fetchSubscriptionMock.mockResolvedValue({
      subscription: {
        id: 'sub-1',
        businessId: 'biz-1',
        plan: 'monthly',
        status: 'active',
        meshulamCustomerId: 'cust-1',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
        trialEndsAt: null,
        cancelledAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      canCreateInvoices: true,
      daysRemaining: 30,
    });

    renderSubscription();

    expect(await screen.findByText('מנוי חודשי')).toBeInTheDocument();
    expect(screen.getByText('פעיל')).toBeInTheDocument();
    expect(screen.getByText(/המנוי מתחדש בעוד 30 ימים/)).toBeInTheDocument();
  });

  it('shows error state on fetch failure', async () => {
    fetchSubscriptionMock.mockRejectedValue(new Error('Network error'));

    renderSubscription();

    expect(await screen.findByText('שגיאה בטעינת נתוני המנוי')).toBeInTheDocument();
    expect(screen.getByText('נסו שוב')).toBeInTheDocument();
  });
});
