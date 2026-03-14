import { describe, expect, it } from 'vitest';
import { createOwnerWithBusinessNoSub } from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';
import {
  getSubscriptionStatus,
  assertCanCreateInvoice,
  startTrial,
} from '../../src/services/subscription-service.js';
import { upsertSubscription } from '../../src/repositories/subscription-repository.js';

describe('subscription-service', () => {
  setupIntegrationTest();

  describe('getSubscriptionStatus', () => {
    it('returns null subscription when none exists', async () => {
      const { business } = await createOwnerWithBusinessNoSub();
      const result = await getSubscriptionStatus(business.id);
      expect(result.subscription).toBeNull();
      expect(result.canCreateInvoices).toBe(false);
    });

    it('returns active status for trialing subscription', async () => {
      const { business } = await createOwnerWithBusinessNoSub();
      await startTrial(business.id);
      const result = await getSubscriptionStatus(business.id);
      expect(result.subscription?.status).toBe('trialing');
      expect(result.canCreateInvoices).toBe(true);
      expect(result.daysRemaining).toBeGreaterThan(0);
    });
  });

  describe('assertCanCreateInvoice', () => {
    it('throws when no subscription exists', async () => {
      const { business } = await createOwnerWithBusinessNoSub();
      await expect(assertCanCreateInvoice(business.id)).rejects.toThrow('נדרש מנוי פעיל');
    });

    it('does not throw when subscription is active', async () => {
      const { business } = await createOwnerWithBusinessNoSub();
      await startTrial(business.id);
      await expect(assertCanCreateInvoice(business.id)).resolves.toBeUndefined();
    });

    it('throws when subscription is expired', async () => {
      const { business } = await createOwnerWithBusinessNoSub();
      const past = new Date();
      past.setDate(past.getDate() - 30);
      const pastEnd = new Date();
      pastEnd.setDate(pastEnd.getDate() - 1);

      await upsertSubscription({
        businessId: business.id,
        plan: 'monthly',
        status: 'active',
        currentPeriodStart: past,
        currentPeriodEnd: pastEnd,
      });

      await expect(assertCanCreateInvoice(business.id)).rejects.toThrow('נדרש מנוי פעיל');
    });
  });
});
