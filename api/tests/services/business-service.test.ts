import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resetDb } from '../utils/db.js';
import { db } from '../../src/db/client.js';
import { users, userBusinesses } from '../../src/db/schema.js';
import {
  createBusiness,
  getBusinessById,
  updateBusinessById,
  listBusinessesForUser,
  listTeamMembers,
  removeTeamMember,
} from '../../src/services/business-service.js';
import * as businessRepository from '../../src/repositories/business-repository.js';

// ── helpers ──────────────────────────────────────────────────────────────────

async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      email: overrides.email ?? `biz-service-${randomUUID()}@example.com`,
      name: overrides.name ?? 'Test User',
    })
    .returning();
  return user;
}

function makeBusinessInput(overrides: Partial<{ registrationNumber: string; name: string }> = {}) {
  return {
    name: overrides.name ?? 'Acme Ltd',
    businessType: 'licensed_dealer' as const,
    registrationNumber:
      overrides.registrationNumber ?? `${randomUUID().replaceAll('-', '').slice(0, 9)}`,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('business-service', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe('createBusiness', () => {
    it('creates business and userBusiness with role owner', async () => {
      const user = await createUser();
      const input = makeBusinessInput();

      const result = await createBusiness(user.id, input);

      expect(result.business.name).toBe(input.name);
      expect(result.business.registrationNumber).toBe(input.registrationNumber);
      expect(result.business.defaultVatRate).toBe(1700);
      expect(result.business.startingInvoiceNumber).toBe(1);
      expect(result.business.createdByUserId).toBe(user.id);
      expect(result.role).toBe('owner');

      const ubRow = await db.query.userBusinesses.findFirst({
        where: (t, { eq }) => eq(t.businessId, result.business.id),
      });
      expect(ubRow?.role).toBe('owner');
      expect(ubRow?.userId).toBe(user.id);
    });

    it('creates business with minimal payload (no address)', async () => {
      const user = await createUser();
      const input = {
        name: 'Minimal Biz',
        businessType: 'licensed_dealer' as const,
        registrationNumber: `${randomUUID().replaceAll('-', '').slice(0, 9)}`,
      };

      const result = await createBusiness(user.id, input);

      expect(result.business.streetAddress).toBeNull();
      expect(result.business.city).toBeNull();
      expect(result.business.defaultVatRate).toBe(1700);
    });

    it('enforces defaultVatRate=0 for exempt_dealer regardless of input', async () => {
      const user = await createUser();
      const input = {
        name: 'Exempt Biz',
        businessType: 'exempt_dealer' as const,
        registrationNumber: `${randomUUID().replaceAll('-', '').slice(0, 9)}`,
        defaultVatRate: 1700,
      };

      const result = await createBusiness(user.id, input);

      expect(result.business.defaultVatRate).toBe(0);
    });

    it('throws conflict on duplicate registrationNumber', async () => {
      const user = await createUser();
      const input = makeBusinessInput();

      // pg-mem + Drizzle wraps errors in DrizzleQueryError which loses the .code property.
      // Spy on insertBusinessTx to throw a PG-style error with code '23505' so the service
      // can detect it via isErrorWithCode — the same check that runs against real PostgreSQL.
      const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505',
        constraint: 'businesses_registration_number_unique',
      });
      const spy = vi.spyOn(businessRepository, 'insertBusinessTx').mockRejectedValueOnce(pgError);

      await expect(createBusiness(user.id, input)).rejects.toMatchObject({
        statusCode: 409,
        code: 'duplicate_registration_number',
      });

      spy.mockRestore();
    });
  });

  describe('getBusinessById', () => {
    it('returns business with role', async () => {
      const user = await createUser();
      const { business } = await createBusiness(user.id, makeBusinessInput());

      const result = await getBusinessById(business.id, 'owner');

      expect(result.business.id).toBe(business.id);
      expect(result.role).toBe('owner');
    });

    it('throws notFound for unknown id', async () => {
      await expect(getBusinessById(randomUUID(), 'owner')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('updateBusinessById', () => {
    it('admin can update name', async () => {
      const user = await createUser();
      const { business } = await createBusiness(user.id, makeBusinessInput());

      const result = await updateBusinessById(business.id, 'admin', { name: 'New Name' });

      expect(result.business.name).toBe('New Name');
      expect(result.role).toBe('admin');
    });

    it('role user throws forbidden', async () => {
      const user = await createUser();
      const { business } = await createBusiness(user.id, makeBusinessInput());

      await expect(
        updateBusinessById(business.id, 'user', { name: 'New Name' })
      ).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('throws notFound for unknown businessId', async () => {
      await expect(
        updateBusinessById(randomUUID(), 'owner', { name: 'Ghost' })
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('updates logoUrl when provided', async () => {
      const user = await createUser();
      const { business } = await createBusiness(user.id, makeBusinessInput());

      const result = await updateBusinessById(business.id, 'owner', {
        logoUrl: 'https://example.com/logo.png',
      });

      expect(result.business.logoUrl).toBe('https://example.com/logo.png');
    });

    it('updates isActive to false when provided', async () => {
      const user = await createUser();
      const { business } = await createBusiness(user.id, makeBusinessInput());

      const result = await updateBusinessById(business.id, 'owner', { isActive: false });

      expect(result.business.isActive).toBe(false);
    });

    it('clears a nullable field when null is provided', async () => {
      const user = await createUser();
      const { business } = await createBusiness(user.id, {
        ...makeBusinessInput(),
        phone: '0521234567',
      });

      expect(business.phone).toBe('0521234567');

      const result = await updateBusinessById(business.id, 'owner', { phone: null });

      expect(result.business.phone).toBeNull();
    });
  });

  describe('listBusinessesForUser', () => {
    it('returns empty array for user with no businesses', async () => {
      const user = await createUser();

      const result = await listBusinessesForUser(user.id);

      expect(result.businesses).toEqual([]);
    });

    it('returns list with role', async () => {
      const user = await createUser();
      const input = makeBusinessInput({ name: 'My Biz' });
      await createBusiness(user.id, input);

      const result = await listBusinessesForUser(user.id);

      expect(result.businesses).toHaveLength(1);
      expect(result.businesses[0].name).toBe('My Biz');
      expect(result.businesses[0].role).toBe('owner');
    });

    it('excludes inactive businesses', async () => {
      const user = await createUser();
      const { business } = await createBusiness(user.id, makeBusinessInput());
      await updateBusinessById(business.id, 'owner', { isActive: false });

      const result = await listBusinessesForUser(user.id);

      expect(result.businesses).toHaveLength(0);
    });
  });

  describe('listTeamMembers', () => {
    it('returns team members with correct fields', async () => {
      const owner = await createUser({ name: 'Owner User' });
      const { business } = await createBusiness(owner.id, makeBusinessInput());

      const member = await createUser({ name: 'Member User' });
      const now = new Date();
      await db.insert(userBusinesses).values({
        userId: member.id,
        businessId: business.id,
        role: 'admin',
        createdAt: now,
      });

      const result = await listTeamMembers(business.id);

      expect(result.team).toHaveLength(2);
      const ownerEntry = result.team.find((m) => m.userId === owner.id);
      expect(ownerEntry?.role).toBe('owner');
      expect(ownerEntry?.name).toBe('Owner User');

      const memberEntry = result.team.find((m) => m.userId === member.id);
      expect(memberEntry?.role).toBe('admin');
      expect(memberEntry?.name).toBe('Member User');
      expect(typeof memberEntry?.joinedAt).toBe('string');
    });

    it('does not include removed members', async () => {
      const owner = await createUser();
      const { business } = await createBusiness(owner.id, makeBusinessInput());

      const member = await createUser();
      await db.insert(userBusinesses).values({
        userId: member.id,
        businessId: business.id,
        role: 'user',
        createdAt: new Date(),
      });

      await removeTeamMember(business.id, member.id, 'owner');

      const result = await listTeamMembers(business.id);

      expect(result.team.some((m) => m.userId === member.id)).toBe(false);
    });
  });

  describe('removeTeamMember', () => {
    it('owner removes admin — soft-deletes (sets removedAt)', async () => {
      const owner = await createUser();
      const { business } = await createBusiness(owner.id, makeBusinessInput());

      const admin = await createUser();
      await db.insert(userBusinesses).values({
        userId: admin.id,
        businessId: business.id,
        role: 'admin',
        createdAt: new Date(),
      });

      await removeTeamMember(business.id, admin.id, 'owner');

      const row = await db.query.userBusinesses.findFirst({
        where: (t, { eq, and }) => and(eq(t.userId, admin.id), eq(t.businessId, business.id)),
      });
      expect(row?.removedAt).not.toBeNull();
    });

    it('throws forbidden with code cannot_remove_owner for owner target', async () => {
      const owner = await createUser();
      const { business } = await createBusiness(owner.id, makeBusinessInput());

      await expect(removeTeamMember(business.id, owner.id, 'owner')).rejects.toMatchObject({
        statusCode: 403,
        code: 'cannot_remove_owner',
      });
    });

    it('admin trying to remove admin throws forbidden with code cannot_remove_admin', async () => {
      const owner = await createUser();
      const { business } = await createBusiness(owner.id, makeBusinessInput());

      const admin1 = await createUser();
      const admin2 = await createUser();
      const now = new Date();
      await db.insert(userBusinesses).values([
        { userId: admin1.id, businessId: business.id, role: 'admin', createdAt: now },
        { userId: admin2.id, businessId: business.id, role: 'admin', createdAt: now },
      ]);

      await expect(removeTeamMember(business.id, admin2.id, 'admin')).rejects.toMatchObject({
        statusCode: 403,
        code: 'cannot_remove_admin',
      });
    });

    it('throws notFound if target not a member', async () => {
      const owner = await createUser();
      const { business } = await createBusiness(owner.id, makeBusinessInput());
      const stranger = await createUser();

      await expect(removeTeamMember(business.id, stranger.id, 'owner')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('role user throws forbidden', async () => {
      const owner = await createUser();
      const { business } = await createBusiness(owner.id, makeBusinessInput());
      const target = await createUser();
      await db.insert(userBusinesses).values({
        userId: target.id,
        businessId: business.id,
        role: 'user',
        createdAt: new Date(),
      });

      await expect(removeTeamMember(business.id, target.id, 'user')).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });
});
