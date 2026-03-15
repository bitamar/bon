import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('Subscription page', () => {
  const fetchSubscriptionMock = vi.mocked(subscriptionsApi.fetchSubscription);
  const startTrialMock = vi.mocked(subscriptionsApi.startTrial);
  const createCheckoutMock = vi.mocked(subscriptionsApi.createCheckout);
  const cancelSubscriptionMock = vi.mocked(subscriptionsApi.cancelSubscription);

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
    startTrialMock.mockResolvedValue({
      subscription: makeSubscription({ status: 'trialing' }),
      canCreateInvoices: true,
      daysRemaining: 14,
    });

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

  it('shows yearly savings badge on plan card', async () => {
    fetchSubscriptionMock.mockResolvedValue({
      subscription: null,
      canCreateInvoices: false,
      daysRemaining: null,
    });

    renderSubscription();

    await screen.findByText('בחרו תוכנית');
    expect(screen.getByText(/חיסכון/)).toBeInTheDocument();
  });

  it('calls createCheckout when pricing checkout button is clicked', async () => {
    fetchSubscriptionMock.mockResolvedValue({
      subscription: null,
      canCreateInvoices: false,
      daysRemaining: null,
    });
    createCheckoutMock.mockResolvedValue({
      paymentUrl: 'https://example.com',
      processId: 'proc-1',
    });

    const user = userEvent.setup();
    renderSubscription();

    await screen.findByText('בחרו תוכנית');
    await user.click(screen.getByRole('button', { name: /התחילו עם/ }));

    expect(createCheckoutMock).toHaveBeenCalledWith(
      'biz-1',
      'monthly',
      expect.stringContaining('success=true'),
      expect.stringContaining('cancelled=true')
    );
  });

  it('calls cancelSubscription when cancel button is clicked on active subscription', async () => {
    fetchSubscriptionMock.mockResolvedValue({
      subscription: makeSubscription({ status: 'active', meshulamCustomerId: 'cust-1' }),
      canCreateInvoices: true,
      daysRemaining: 30,
    });
    cancelSubscriptionMock.mockResolvedValue({ ok: true as const });

    const user = userEvent.setup();
    renderSubscription();

    await user.click(await screen.findByRole('button', { name: 'ביטול מנוי' }));

    expect(cancelSubscriptionMock).toHaveBeenCalledWith('biz-1');
  });

  it('shows checkout button in trial upgrade card', async () => {
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

    expect(await screen.findByRole('button', { name: 'עברו לתשלום' })).toBeInTheDocument();
  });

  it('clicking trial button calls startTrial', async () => {
    fetchSubscriptionMock.mockResolvedValue({
      subscription: null,
      canCreateInvoices: false,
      daysRemaining: null,
    });
    startTrialMock.mockResolvedValue({
      subscription: makeSubscription({ status: 'trialing' }),
      canCreateInvoices: true,
      daysRemaining: 14,
    });

    const user = userEvent.setup();
    renderSubscription();

    await screen.findByText('בחרו תוכנית');
    await user.click(screen.getByRole('button', { name: /ימי ניסיון חינם/ }));

    expect(startTrialMock).toHaveBeenCalledWith('biz-1');
  });

  it('selecting yearly plan updates the checkout button text', async () => {
    fetchSubscriptionMock.mockResolvedValue({
      subscription: null,
      canCreateInvoices: false,
      daysRemaining: null,
    });

    const user = userEvent.setup();
    renderSubscription();

    await screen.findByText('בחרו תוכנית');
    expect(screen.getByRole('button', { name: /לחודש/ })).toBeInTheDocument();

    await user.click(screen.getByText('שנתי'));

    expect(screen.getByRole('button', { name: /לשנה/ })).toBeInTheDocument();
  });

  it('clicking checkout in trial upgrade card calls createCheckout', async () => {
    fetchSubscriptionMock.mockResolvedValue({
      subscription: makeSubscription({
        status: 'trialing',
        trialEndsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
        currentPeriodEnd: new Date(Date.now() + 14 * 86400000).toISOString(),
      }),
      canCreateInvoices: true,
      daysRemaining: 14,
    });
    createCheckoutMock.mockResolvedValue({
      paymentUrl: 'https://example.com',
      processId: 'proc-1',
    });

    const user = userEvent.setup();
    renderSubscription();

    await user.click(await screen.findByRole('button', { name: 'עברו לתשלום' }));

    expect(createCheckoutMock).toHaveBeenCalledWith(
      'biz-1',
      'monthly',
      expect.stringContaining('success=true'),
      expect.stringContaining('cancelled=true')
    );
  });

  it('shows yearly plan label in active subscription', async () => {
    fetchSubscriptionMock.mockResolvedValue({
      subscription: makeSubscription({
        plan: 'yearly',
        status: 'active',
        meshulamCustomerId: 'cust-1',
      }),
      canCreateInvoices: true,
      daysRemaining: 30,
    });

    renderSubscription();

    expect(await screen.findByText('מנוי שנתי')).toBeInTheDocument();
  });
});
