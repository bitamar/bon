import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { injectAuthed } from '../utils/inject.js';
import {
  createAuthedUser,
  createUser,
  createTestBusiness,
  createOwnerWithBusiness,
  createMemberInBusiness,
  createPendingInvitation,
} from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';

vi.mock('openid-client', () => ({
  discovery: vi.fn().mockResolvedValue({}),
  ClientSecretPost: (secret: string) => ({ secret }),
  authorizationCodeGrant: vi.fn(),
}));

describe('routes/invitations', () => {
  const ctx = setupIntegrationTest();

  describe('POST /businesses/:businessId/invitations', () => {
    it('allows owner to invite a user', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/invitations`,
        payload: { email: 'invite@example.com', role: 'user' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });
    });

    it('returns 404 for user with role=user', async () => {
      const { sessionId, business } = await createMemberInBusiness('user');

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/invitations`,
        payload: { email: 'invite@example.com', role: 'user' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 409 for duplicate pending invitation', async () => {
      const { user, sessionId, business } = await createOwnerWithBusiness();
      const inviteeEmail = `invitee-${randomUUID()}@example.com`;
      await createPendingInvitation(business.id, user.id, inviteeEmail);

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/invitations`,
        payload: { email: inviteeEmail, role: 'user' },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'invitation_already_exists' });
    });
  });

  describe('GET /businesses/:businessId/invitations', () => {
    it('returns invitations list for owner', async () => {
      const { user, sessionId, business } = await createOwnerWithBusiness();
      await createPendingInvitation(business.id, user.id, `inv-${randomUUID()}@example.com`);

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'GET',
        url: `/businesses/${business.id}/invitations`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { invitations: { id: string }[] };
      expect(Array.isArray(body.invitations)).toBe(true);
      expect(body.invitations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /invitations/mine', () => {
    it('returns pending invitations for the authenticated user', async () => {
      const inviteeEmail = `invitee-${randomUUID()}@example.com`;
      const { sessionId } = await createAuthedUser({ email: inviteeEmail });
      const ownerUser = await createUser();
      const business = await createTestBusiness(ownerUser.id);
      await createPendingInvitation(business.id, ownerUser.id, inviteeEmail);

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'GET',
        url: '/invitations/mine',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { invitations: { email?: string }[] };
      expect(Array.isArray(body.invitations)).toBe(true);
      expect(body.invitations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /invitations/:token/accept', () => {
    it('accepts a valid invitation', async () => {
      const inviteeEmail = `invitee-${randomUUID()}@example.com`;
      const { sessionId } = await createAuthedUser({ email: inviteeEmail });
      const ownerUser = await createUser();
      const business = await createTestBusiness(ownerUser.id);
      const inv = await createPendingInvitation(business.id, ownerUser.id, inviteeEmail);

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/invitations/${inv.token}/accept`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });
    });

    it('returns 403 when invitation email does not match user email', async () => {
      const { sessionId } = await createAuthedUser({ email: `user-${randomUUID()}@example.com` });
      const ownerUser = await createUser();
      const business = await createTestBusiness(ownerUser.id);
      const inv = await createPendingInvitation(
        business.id,
        ownerUser.id,
        `different-${randomUUID()}@example.com`
      );

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/invitations/${inv.token}/accept`,
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /invitations/:token/decline', () => {
    it('declines a valid invitation', async () => {
      const inviteeEmail = `invitee-${randomUUID()}@example.com`;
      const { sessionId } = await createAuthedUser({ email: inviteeEmail });
      const ownerUser = await createUser();
      const business = await createTestBusiness(ownerUser.id);
      const inv = await createPendingInvitation(business.id, ownerUser.id, inviteeEmail);

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/invitations/${inv.token}/decline`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });
    });
  });
});
