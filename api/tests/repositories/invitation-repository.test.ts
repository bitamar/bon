import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resetDb } from '../utils/db.js';
import { db } from '../../src/db/client.js';
import { businessInvitations } from '../../src/db/schema.js';
import {
  insertInvitation,
  findInvitationByToken,
  findInvitationsByBusinessId,
  findPendingInvitationsByEmail,
  updateInvitationStatus,
  findExistingInvitation,
} from '../../src/repositories/invitation-repository.js';
import { createUser, createTestBusiness, createPendingInvitation } from '../utils/businesses.js';

describe('invitation-repository', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe('insertInvitation', () => {
    it('inserts and returns an invitation record', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

      const result = await insertInvitation({
        businessId: business.id,
        email: 'invited@example.com',
        role: 'user',
        invitedByUserId: user.id,
        token,
        expiresAt,
      });

      expect(result).not.toBeNull();
      expect(result?.token).toBe(token);
      expect(result?.email).toBe('invited@example.com');
      expect(result?.role).toBe('user');
      expect(result?.status).toBe('pending');
      expect(result?.businessId).toBe(business.id);
    });
  });

  describe('findInvitationByToken', () => {
    it('finds an invitation by token', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);
      const inv = await createPendingInvitation(business.id, user.id, 'find-token@example.com');

      const result = await findInvitationByToken(inv.token);

      expect(result).not.toBeNull();
      expect(result?.token).toBe(inv.token);
    });

    it('returns null for a wrong token', async () => {
      const result = await findInvitationByToken('nonexistent-token');

      expect(result).toBeNull();
    });
  });

  describe('findInvitationsByBusinessId', () => {
    it('returns invitations with joined businessName and invitedByName', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);
      await createPendingInvitation(business.id, user.id, 'team@example.com');

      const results = await findInvitationsByBusinessId(business.id);

      expect(results).toHaveLength(1);
      expect(results[0].businessId).toBe(business.id);
      expect(results[0].businessName).toBe(business.name);
      expect(results[0].invitedByName).toBe(user.name);
      expect(results[0].email).toBe('team@example.com');
    });
  });

  describe('findPendingInvitationsByEmail', () => {
    it('returns only pending invitations for the given email', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);
      const targetEmail = `pending-${randomUUID()}@example.com`;

      const pending = await createPendingInvitation(business.id, user.id, targetEmail);

      // insert a non-pending one
      await db.insert(businessInvitations).values({
        businessId: business.id,
        email: `other-${randomUUID()}@example.com`,
        role: 'admin',
        invitedByUserId: user.id,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
        status: 'accepted',
      });

      const results = await findPendingInvitationsByEmail(targetEmail);

      expect(results).toHaveLength(1);
      expect(results[0].token).toBe(pending.token);
      expect(results[0].businessName).toBe(business.name);
      expect(results[0].invitedByName).toBe(user.name);
    });

    it('does not return non-pending invitations for the email', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);
      const targetEmail = `declined-${randomUUID()}@example.com`;

      const inv = await createPendingInvitation(business.id, user.id, targetEmail);
      await updateInvitationStatus(inv.id, 'declined', new Date());

      const results = await findPendingInvitationsByEmail(targetEmail);

      expect(results).toHaveLength(0);
    });
  });

  describe('updateInvitationStatus', () => {
    it('sets status to accepted and records acceptedAt', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);
      const inv = await createPendingInvitation(business.id, user.id, 'accept-me@example.com');

      const result = await updateInvitationStatus(inv.id, 'accepted', new Date());

      expect(result?.status).toBe('accepted');
      expect(result?.acceptedAt).toBeTruthy();
      expect(result?.declinedAt).toBeNull();
    });

    it('sets status to declined and records declinedAt', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);
      const inv = await createPendingInvitation(business.id, user.id, 'decline-me@example.com');

      const result = await updateInvitationStatus(inv.id, 'declined', new Date());

      expect(result?.status).toBe('declined');
      expect(result?.declinedAt).toBeTruthy();
      expect(result?.acceptedAt).toBeNull();
    });
  });

  describe('findExistingInvitation', () => {
    it('finds a pending invitation for a business and email', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);
      const email = `existing-${randomUUID()}@example.com`;

      await createPendingInvitation(business.id, user.id, email);

      const result = await findExistingInvitation(business.id, email);

      expect(result).not.toBeNull();
      expect(result?.email).toBe(email);
      expect(result?.status).toBe('pending');
    });

    it('returns null after the invitation status has been changed', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);
      const email = `changed-${randomUUID()}@example.com`;

      const inv = await createPendingInvitation(business.id, user.id, email);
      await updateInvitationStatus(inv.id, 'accepted', new Date());

      const result = await findExistingInvitation(business.id, email);

      expect(result).toBeNull();
    });
  });
});
