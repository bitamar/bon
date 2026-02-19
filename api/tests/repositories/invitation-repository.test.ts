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
import { createUser, createTestBusiness } from '../utils/businesses.js';

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
      const token = randomUUID();

      await db.insert(businessInvitations).values({
        businessId: business.id,
        email: 'find-token@example.com',
        role: 'admin',
        invitedByUserId: user.id,
        token,
        expiresAt: new Date(Date.now() + 86400000),
      });

      const result = await findInvitationByToken(token);

      expect(result).not.toBeNull();
      expect(result?.token).toBe(token);
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

      await db.insert(businessInvitations).values({
        businessId: business.id,
        email: 'team@example.com',
        role: 'user',
        invitedByUserId: user.id,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
      });

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

      const pendingToken = randomUUID();
      const acceptedToken = randomUUID();

      await db.insert(businessInvitations).values([
        {
          businessId: business.id,
          email: targetEmail,
          role: 'user',
          invitedByUserId: user.id,
          token: pendingToken,
          expiresAt: new Date(Date.now() + 86400000),
          status: 'pending',
        },
        {
          businessId: business.id,
          email: `other-${randomUUID()}@example.com`,
          role: 'admin',
          invitedByUserId: user.id,
          token: acceptedToken,
          expiresAt: new Date(Date.now() + 86400000),
          status: 'accepted',
        },
      ]);

      const results = await findPendingInvitationsByEmail(targetEmail);

      expect(results).toHaveLength(1);
      expect(results[0].token).toBe(pendingToken);
      expect(results[0].businessName).toBe(business.name);
      expect(results[0].invitedByName).toBe(user.name);
    });

    it('does not return non-pending invitations for the email', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);
      const targetEmail = `declined-${randomUUID()}@example.com`;

      const inv = await db
        .insert(businessInvitations)
        .values({
          businessId: business.id,
          email: targetEmail,
          role: 'user',
          invitedByUserId: user.id,
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 86400000),
          status: 'pending',
        })
        .returning();

      await updateInvitationStatus(inv[0].id, 'declined', new Date());

      const results = await findPendingInvitationsByEmail(targetEmail);

      expect(results).toHaveLength(0);
    });
  });

  describe('updateInvitationStatus', () => {
    it('sets status to accepted and records acceptedAt', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);
      const inv = await db
        .insert(businessInvitations)
        .values({
          businessId: business.id,
          email: 'accept-me@example.com',
          role: 'user',
          invitedByUserId: user.id,
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 86400000),
        })
        .returning();

      const timestamp = new Date();
      const result = await updateInvitationStatus(inv[0].id, 'accepted', timestamp);

      expect(result?.status).toBe('accepted');
      expect(result?.acceptedAt).toBeTruthy();
      expect(result?.declinedAt).toBeNull();
    });

    it('sets status to declined and records declinedAt', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);
      const inv = await db
        .insert(businessInvitations)
        .values({
          businessId: business.id,
          email: 'decline-me@example.com',
          role: 'user',
          invitedByUserId: user.id,
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 86400000),
        })
        .returning();

      const timestamp = new Date();
      const result = await updateInvitationStatus(inv[0].id, 'declined', timestamp);

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

      await db.insert(businessInvitations).values({
        businessId: business.id,
        email,
        role: 'user',
        invitedByUserId: user.id,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
      });

      const result = await findExistingInvitation(business.id, email);

      expect(result).not.toBeNull();
      expect(result?.email).toBe(email);
      expect(result?.status).toBe('pending');
    });

    it('returns null after the invitation status has been changed', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);
      const email = `changed-${randomUUID()}@example.com`;

      const inv = await db
        .insert(businessInvitations)
        .values({
          businessId: business.id,
          email,
          role: 'user',
          invitedByUserId: user.id,
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 86400000),
        })
        .returning();

      await updateInvitationStatus(inv[0].id, 'accepted', new Date());

      const result = await findExistingInvitation(business.id, email);

      expect(result).toBeNull();
    });
  });
});
