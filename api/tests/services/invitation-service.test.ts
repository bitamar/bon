import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { resetDb } from '../utils/db.js';
import { db } from '../../src/db/client.js';
import { users, businesses, userBusinesses, businessInvitations } from '../../src/db/schema.js';
import {
  createInvitation,
  listInvitations,
  getMyInvitations,
  acceptInvitation,
  declineInvitation,
} from '../../src/services/invitation-service.js';

async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      email: overrides.email ?? `inv-service-${randomUUID()}@example.com`,
      name: overrides.name ?? 'Test User',
    })
    .returning();
  return user;
}

async function createBusiness(userId: string, registrationNumber?: string) {
  const now = new Date();
  const [business] = await db
    .insert(businesses)
    .values({
      name: 'Test Business',
      businessType: 'licensed_dealer',
      registrationNumber: registrationNumber ?? `${randomUUID().replaceAll('-', '').slice(0, 9)}`,
      streetAddress: '1 Main St',
      city: 'Tel Aviv',
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await db.insert(userBusinesses).values({
    userId,
    businessId: business.id,
    role: 'owner',
    createdAt: now,
  });

  return business;
}

async function insertInvitation(
  businessId: string,
  invitedByUserId: string,
  overrides: Partial<typeof businessInvitations.$inferInsert> = {}
) {
  const now = new Date();
  const [inv] = await db
    .insert(businessInvitations)
    .values({
      businessId,
      email: overrides.email ?? `invitee-${randomUUID()}@example.com`,
      role: overrides.role ?? 'user',
      invitedByUserId,
      token: overrides.token ?? randomBytes(32).toString('hex'),
      status: overrides.status ?? 'pending',
      expiresAt: overrides.expiresAt ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      createdAt: now,
    })
    .returning();
  return inv;
}

describe('invitation-service', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe('createInvitation', () => {
    it('creates invitation with correct fields', async () => {
      const user = await createUser();
      const business = await createBusiness(user.id);
      const email = `new-invitee-${randomUUID()}@example.com`;

      const inv = await createInvitation(business.id, user.id, { email, role: 'admin' });

      expect(inv.businessId).toBe(business.id);
      expect(inv.email).toBe(email);
      expect(inv.role).toBe('admin');
      expect(inv.status).toBe('pending');
      expect(typeof inv.token).toBe('string');
      expect(inv.token).toHaveLength(64);
      expect(inv.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('throws conflict if pending invitation already exists for same email+business', async () => {
      const user = await createUser();
      const business = await createBusiness(user.id);
      const email = `dup-${randomUUID()}@example.com`;

      await createInvitation(business.id, user.id, { email, role: 'user' });

      await expect(
        createInvitation(business.id, user.id, { email, role: 'admin' })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'invitation_already_exists',
      });
    });
  });

  describe('listInvitations', () => {
    it('returns invitations for business', async () => {
      const user = await createUser();
      const business = await createBusiness(user.id);
      const email = `listed-${randomUUID()}@example.com`;

      await createInvitation(business.id, user.id, { email, role: 'user' });

      const result = await listInvitations(business.id);

      expect(result.invitations).toHaveLength(1);
      expect(result.invitations[0].email).toBe(email);
      expect(result.invitations[0].businessId).toBe(business.id);
    });
  });

  describe('getMyInvitations', () => {
    it('returns pending invitations for email', async () => {
      const owner = await createUser();
      const business = await createBusiness(owner.id);
      const email = `me-${randomUUID()}@example.com`;

      await createInvitation(business.id, owner.id, { email, role: 'user' });

      const result = await getMyInvitations(email);

      expect(result.invitations).toHaveLength(1);
      expect(result.invitations[0].businessId).toBe(business.id);
    });

    it('ignores non-pending invitations', async () => {
      const owner = await createUser();
      const business = await createBusiness(owner.id);
      const email = `me-nonpending-${randomUUID()}@example.com`;

      await insertInvitation(business.id, owner.id, { email, status: 'accepted' });
      await insertInvitation(business.id, owner.id, {
        email: `me-nonpending2-${randomUUID()}@example.com`,
        status: 'declined',
      });

      const result = await getMyInvitations(email);

      expect(result.invitations).toHaveLength(0);
    });
  });

  describe('acceptInvitation', () => {
    it('happy path — inserts userBusiness and marks invitation accepted', async () => {
      const owner = await createUser();
      const business = await createBusiness(owner.id);
      const invitee = await createUser();

      const inv = await insertInvitation(business.id, owner.id, {
        email: invitee.email,
        role: 'user',
      });

      await acceptInvitation(inv.token, invitee.id, invitee.email);

      const ubRow = await db.query.userBusinesses.findFirst({
        where: (t, { eq, and }) => and(eq(t.userId, invitee.id), eq(t.businessId, business.id)),
      });
      expect(ubRow?.role).toBe('user');

      const updatedInv = await db.query.businessInvitations.findFirst({
        where: (t, { eq }) => eq(t.id, inv.id),
      });
      expect(updatedInv?.status).toBe('accepted');
    });

    it('throws notFound for unknown token', async () => {
      const user = await createUser();

      await expect(
        acceptInvitation(
          'nonexistenttoken00000000000000000000000000000000000000000000000000',
          user.id,
          user.email
        )
      ).rejects.toMatchObject({ statusCode: 404, code: 'invitation_not_found' });
    });

    it('throws badRequest for non-pending invitation', async () => {
      const owner = await createUser();
      const business = await createBusiness(owner.id);
      const invitee = await createUser();

      const inv = await insertInvitation(business.id, owner.id, {
        email: invitee.email,
        status: 'declined',
      });

      await expect(acceptInvitation(inv.token, invitee.id, invitee.email)).rejects.toMatchObject({
        statusCode: 400,
        code: 'invitation_not_pending',
      });
    });

    it('throws forbidden for email mismatch', async () => {
      const owner = await createUser();
      const business = await createBusiness(owner.id);
      const invitee = await createUser();
      const wrongUser = await createUser();

      const inv = await insertInvitation(business.id, owner.id, { email: invitee.email });

      await expect(
        acceptInvitation(inv.token, wrongUser.id, wrongUser.email)
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'email_mismatch',
      });
    });

    it('throws badRequest and marks expired when expiresAt is in the past', async () => {
      const owner = await createUser();
      const business = await createBusiness(owner.id);
      const invitee = await createUser();

      const pastDate = new Date(Date.now() - 1000);
      const inv = await insertInvitation(business.id, owner.id, {
        email: invitee.email,
        expiresAt: pastDate,
      });

      await expect(acceptInvitation(inv.token, invitee.id, invitee.email)).rejects.toMatchObject({
        statusCode: 400,
        code: 'invitation_expired',
      });

      const updatedInv = await db.query.businessInvitations.findFirst({
        where: (t, { eq }) => eq(t.id, inv.id),
      });
      expect(updatedInv?.status).toBe('expired');
    });

    it('throws conflict if user already a member', async () => {
      const owner = await createUser();
      const business = await createBusiness(owner.id);
      const invitee = await createUser();

      // Insert invitee as existing member
      await db.insert(userBusinesses).values({
        userId: invitee.id,
        businessId: business.id,
        role: 'user',
        createdAt: new Date(),
      });

      const inv = await insertInvitation(business.id, owner.id, { email: invitee.email });

      await expect(acceptInvitation(inv.token, invitee.id, invitee.email)).rejects.toMatchObject({
        statusCode: 409,
        code: 'already_member',
      });
    });
  });

  describe('declineInvitation', () => {
    it('happy path — marks declined', async () => {
      const owner = await createUser();
      const business = await createBusiness(owner.id);
      const invitee = await createUser();

      const inv = await insertInvitation(business.id, owner.id, { email: invitee.email });

      await declineInvitation(inv.token, invitee.id, invitee.email);

      const updatedInv = await db.query.businessInvitations.findFirst({
        where: (t, { eq }) => eq(t.id, inv.id),
      });
      expect(updatedInv?.status).toBe('declined');
    });

    it('throws notFound for unknown token', async () => {
      const user = await createUser();

      await expect(
        declineInvitation(
          'nonexistenttoken00000000000000000000000000000000000000000000000000',
          user.id,
          user.email
        )
      ).rejects.toMatchObject({ statusCode: 404, code: 'invitation_not_found' });
    });

    it('throws badRequest for non-pending invitation', async () => {
      const owner = await createUser();
      const business = await createBusiness(owner.id);
      const invitee = await createUser();

      const inv = await insertInvitation(business.id, owner.id, {
        email: invitee.email,
        status: 'accepted',
      });

      await expect(declineInvitation(inv.token, invitee.id, invitee.email)).rejects.toMatchObject({
        statusCode: 400,
        code: 'invitation_not_pending',
      });
    });

    it('throws forbidden for email mismatch', async () => {
      const owner = await createUser();
      const business = await createBusiness(owner.id);
      const invitee = await createUser();
      const wrongUser = await createUser();

      const inv = await insertInvitation(business.id, owner.id, { email: invitee.email });

      await expect(
        declineInvitation(inv.token, wrongUser.id, wrongUser.email)
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'email_mismatch',
      });
    });
  });
});
