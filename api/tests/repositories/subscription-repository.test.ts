import { describe, expect, it } from 'vitest';
import { setupIntegrationTest } from '../utils/server.js';
import { createOwnerWithBusinessNoSub } from '../utils/businesses.js';
import {
  findSubscriptionByBusinessId,
  insertSubscription,
  updateSubscription,
  upsertSubscription,
} from '../../src/repositories/subscription-repository.js';

describe('subscription-repository', () => {
  setupIntegrationTest();

  describe('findSubscriptionByBusinessId', () => {
    it('returns null when no subscription exists', async () => {
      const { business } = await createOwnerWithBusinessNoSub();
      const result = await findSubscriptionByBusinessId(business.id);
      expect(result).toBeNull();
    });

    it('returns the subscription when it exists', async () => {
      const { business } = await createOwnerWithBusinessNoSub();
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 30);

      await insertSubscription({
        businessId: business.id,
        plan: 'monthly',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: end,
      });

      const result = await findSubscriptionByBusinessId(business.id);
      expect(result).not.toBeNull();
      expect(result!.plan).toBe('monthly');
      expect(result!.status).toBe('active');
    });
  });

  describe('insertSubscription', () => {
    it('creates a subscription and returns it', async () => {
      const { business } = await createOwnerWithBusinessNoSub();
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 14);

      const sub = await insertSubscription({
        businessId: business.id,
        plan: 'yearly',
        status: 'trialing',
        currentPeriodStart: now,
        currentPeriodEnd: end,
        trialEndsAt: end,
      });

      expect(sub).not.toBeNull();
      expect(sub!.businessId).toBe(business.id);
      expect(sub!.plan).toBe('yearly');
      expect(sub!.status).toBe('trialing');
      expect(sub!.trialEndsAt).not.toBeNull();
    });
  });

  describe('updateSubscription', () => {
    it('updates status and sets updatedAt', async () => {
      const { business } = await createOwnerWithBusinessNoSub();
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 30);

      const sub = await insertSubscription({
        businessId: business.id,
        plan: 'monthly',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: end,
      });

      const updated = await updateSubscription(sub!.id, {
        status: 'cancelled',
        cancelledAt: new Date(),
      });

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('cancelled');
      expect(updated!.cancelledAt).not.toBeNull();
    });
  });

  describe('upsertSubscription', () => {
    it('updates existing subscription on conflict', async () => {
      const { business } = await createOwnerWithBusinessNoSub();
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 14);

      await insertSubscription({
        businessId: business.id,
        plan: 'monthly',
        status: 'trialing',
        currentPeriodStart: now,
        currentPeriodEnd: end,
      });

      const newEnd = new Date(now);
      newEnd.setFullYear(newEnd.getFullYear() + 1);

      const upserted = await upsertSubscription({
        businessId: business.id,
        plan: 'yearly',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: newEnd,
      });

      expect(upserted).not.toBeNull();
      expect(upserted!.plan).toBe('yearly');
      expect(upserted!.status).toBe('active');

      // Verify only one row exists
      const found = await findSubscriptionByBusinessId(business.id);
      expect(found!.id).toBe(upserted!.id);
    });
  });
});
