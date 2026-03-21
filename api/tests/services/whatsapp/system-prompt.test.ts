import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../../../src/services/whatsapp/system-prompt.js';

describe('buildSystemPrompt', () => {
  it('interpolates user name, business name, role, and date', () => {
    const prompt = buildSystemPrompt({
      userName: 'יוסי',
      businessName: 'חשמל בע"מ',
      userRole: 'בעלים',
      date: '2026-03-21',
    });

    expect(prompt).toContain('יוסי');
    expect(prompt).toContain('חשמל בע"מ');
    expect(prompt).toContain('בעלים');
    expect(prompt).toContain('2026-03-21');
    expect(prompt).toContain('17%');
  });

  it('handles null business name with selection prompt', () => {
    const prompt = buildSystemPrompt({
      userName: 'דנה',
      businessName: null,
      userRole: null,
      date: '2026-03-21',
    });

    expect(prompt).toContain('דנה');
    expect(prompt).toContain('עדיין לא נבחר עסק');
    expect(prompt).toContain('select_business');
    expect(prompt).not.toContain('null');
  });

  it('contains no unresolved template variables', () => {
    const prompt = buildSystemPrompt({
      userName: 'Test',
      businessName: 'Biz',
      userRole: 'admin',
      date: '2026-01-01',
    });

    expect(prompt).not.toMatch(/\{[^}]+\}/);
  });

  it('includes all rules', () => {
    const prompt = buildSystemPrompt({
      userName: 'Test',
      businessName: 'Biz',
      userRole: 'admin',
      date: '2026-01-01',
    });

    expect(prompt).toContain('ענה תמיד בעברית');
    expect(prompt).toContain('בקש אישור');
    expect(prompt).toContain('₪');
  });
});
