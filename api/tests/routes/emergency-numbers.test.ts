import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupIntegrationTest } from '../utils/server.js';
import {
  createOwnerWithBusiness,
  createAuthedUser,
  addUserToBusiness,
} from '../utils/businesses.js';
import { injectAuthed } from '../utils/inject.js';
import { insertEmergencyNumbers } from '../../src/repositories/emergency-allocation-repository.js';

// ── helpers ──

const ctx = setupIntegrationTest();

function postNumbers(sessionId: string, businessId: string, numbers: string[]) {
  return injectAuthed(ctx.app, sessionId, {
    method: 'POST',
    url: `/businesses/${businessId}/emergency-numbers`,
    payload: { numbers },
  });
}

function getNumbers(sessionId: string, businessId: string) {
  return injectAuthed(ctx.app, sessionId, {
    method: 'GET',
    url: `/businesses/${businessId}/emergency-numbers`,
  });
}

function deleteNumber(sessionId: string, businessId: string, id: string) {
  return injectAuthed(ctx.app, sessionId, {
    method: 'DELETE',
    url: `/businesses/${businessId}/emergency-numbers/${id}`,
  });
}

describe('emergency-numbers routes', () => {
  let sessionId: string;
  let businessId: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    const result = await createOwnerWithBusiness();
    sessionId = result.sessionId;
    businessId = result.business.id;
  });

  describe('POST /businesses/:businessId/emergency-numbers', () => {
    it('adds emergency numbers and returns 201', async () => {
      const res = await postNumbers(sessionId, businessId, ['EMG-001', 'EMG-002']);
      expect(res.statusCode).toBe(201);

      const body = JSON.parse(res.body);
      expect(body.numbers).toHaveLength(2);
      expect(body.availableCount).toBe(2);
      expect(body.usedCount).toBe(0);
    });

    it('rejects empty numbers array', async () => {
      const res = await postNumbers(sessionId, businessId, []);
      expect(res.statusCode).toBe(400);
    });

    it('rejects non-owner users', async () => {
      const { sessionId: userSessionId, user } = await createAuthedUser();
      await addUserToBusiness(user.id, businessId, 'user');

      const res = await postNumbers(userSessionId, businessId, ['EMG-001']);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /businesses/:businessId/emergency-numbers', () => {
    it('returns empty pool', async () => {
      const res = await getNumbers(sessionId, businessId);
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.numbers).toHaveLength(0);
      expect(body.availableCount).toBe(0);
    });

    it('returns pool with numbers', async () => {
      await insertEmergencyNumbers([
        { businessId, number: 'EMG-001', acquiredAt: new Date() },
        { businessId, number: 'EMG-002', acquiredAt: new Date() },
      ]);

      const res = await getNumbers(sessionId, businessId);
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.numbers).toHaveLength(2);
      expect(body.availableCount).toBe(2);
    });

    it('allows admin access', async () => {
      const { sessionId: adminSessionId, user } = await createAuthedUser();
      await addUserToBusiness(user.id, businessId, 'admin');

      const res = await getNumbers(adminSessionId, businessId);
      expect(res.statusCode).toBe(200);
    });
  });

  describe('DELETE /businesses/:businessId/emergency-numbers/:id', () => {
    it('deletes an unused number', async () => {
      const [inserted] = await insertEmergencyNumbers([
        { businessId, number: 'EMG-DEL', acquiredAt: new Date() },
      ]);

      const res = await deleteNumber(sessionId, businessId, inserted!.id);
      expect(res.statusCode).toBe(200);

      const listRes = await getNumbers(sessionId, businessId);
      const body = JSON.parse(listRes.body);
      expect(body.numbers).toHaveLength(0);
    });

    it('returns 404 for nonexistent number', async () => {
      const res = await deleteNumber(sessionId, businessId, '00000000-0000-0000-0000-000000000099');
      expect(res.statusCode).toBe(404);
    });
  });
});
