import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmergencyNumbersSection } from '../../components/EmergencyNumbersSection';
import { renderWithProviders } from '../utils/renderWithProviders';
import { EMERGENCY_POOL_LOW_THRESHOLD } from '@bon/types/shaam';
import type { EmergencyNumber, EmergencyNumbersResponse } from '@bon/types/shaam';

vi.mock('../../api/emergency-numbers', () => ({
  fetchEmergencyNumbers: vi.fn(),
  addEmergencyNumbers: vi.fn(),
  deleteEmergencyNumber: vi.fn(),
}));

import * as emergencyNumbersApi from '../../api/emergency-numbers';

// ── helpers ──

function makeNumber(overrides: Partial<EmergencyNumber> = {}): EmergencyNumber {
  return {
    id: 'num-1',
    businessId: 'biz-1',
    number: 'E-001',
    used: false,
    usedForInvoiceId: null,
    usedAt: null,
    reported: false,
    reportedAt: null,
    acquiredAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeResponse(overrides: Partial<EmergencyNumbersResponse> = {}): EmergencyNumbersResponse {
  return {
    numbers: [],
    availableCount: 0,
    usedCount: 0,
    ...overrides,
  };
}

function renderSection(businessId = 'biz-1') {
  return renderWithProviders(<EmergencyNumbersSection businessId={businessId} />);
}

describe('EmergencyNumbersSection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows loading skeleton while fetching', () => {
    vi.mocked(emergencyNumbersApi.fetchEmergencyNumbers).mockReturnValue(new Promise(() => {}));
    const { container } = renderSection();

    // FormSkeleton renders Skeleton elements with data-visible="true"
    const skeletons = container.querySelectorAll('[data-visible="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error state on fetch failure', async () => {
    vi.mocked(emergencyNumbersApi.fetchEmergencyNumbers).mockRejectedValue(
      new Error('network error')
    );
    renderSection();

    expect(await screen.findByText('לא הצלחנו לטעון מספרי חירום')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'נסה שוב' })).toBeInTheDocument();
  });

  it('renders numbers table with available numbers', async () => {
    const numbers = [
      makeNumber({ id: 'num-1', number: 'E-001' }),
      makeNumber({ id: 'num-2', number: 'E-002' }),
    ];
    vi.mocked(emergencyNumbersApi.fetchEmergencyNumbers).mockResolvedValue(
      makeResponse({ numbers, availableCount: 2, usedCount: 0 })
    );
    renderSection();

    expect(await screen.findByText('E-001')).toBeInTheDocument();
    expect(screen.getByText('E-002')).toBeInTheDocument();
    expect(screen.getByText('מספר')).toBeInTheDocument();
    expect(screen.getByText('סטטוס')).toBeInTheDocument();
  });

  it('shows correct status badges for available, used, and reported numbers', async () => {
    const numbers = [
      makeNumber({ id: 'num-1', number: 'E-001', used: false, reported: false }),
      makeNumber({
        id: 'num-2',
        number: 'E-002',
        used: true,
        reported: false,
        usedAt: '2026-02-01T00:00:00.000Z',
      }),
      makeNumber({
        id: 'num-3',
        number: 'E-003',
        used: true,
        reported: true,
        usedAt: '2026-02-01T00:00:00.000Z',
        reportedAt: '2026-02-02T00:00:00.000Z',
      }),
    ];
    vi.mocked(emergencyNumbersApi.fetchEmergencyNumbers).mockResolvedValue(
      makeResponse({ numbers, availableCount: 1, usedCount: 2 })
    );
    renderSection();

    expect(await screen.findByText('זמין')).toBeInTheDocument();
    expect(screen.getByText('בשימוש')).toBeInTheDocument();
    expect(screen.getByText('דווח')).toBeInTheDocument();
  });

  it('shows empty state when no numbers exist', async () => {
    vi.mocked(emergencyNumbersApi.fetchEmergencyNumbers).mockResolvedValue(
      makeResponse({ numbers: [], availableCount: 0, usedCount: 0 })
    );
    renderSection();

    expect(await screen.findByText('לא הוזנו מספרי חירום עדיין')).toBeInTheDocument();
  });

  it('shows pool low warning when availableCount is below threshold and above zero', async () => {
    const lowCount = EMERGENCY_POOL_LOW_THRESHOLD - 1;
    const numbers = Array.from({ length: lowCount }, (_, i) =>
      makeNumber({ id: `num-${i}`, number: `E-00${i}` })
    );
    vi.mocked(emergencyNumbersApi.fetchEmergencyNumbers).mockResolvedValue(
      makeResponse({ numbers, availableCount: lowCount, usedCount: 10 })
    );
    renderSection();

    expect(await screen.findByText('מאגר מספרי החירום עומד להסתיים')).toBeInTheDocument();
    expect(screen.getByText('יש להזין מספרים חדשים')).toBeInTheDocument();
  });

  it('shows pool empty warning when availableCount is zero and usedCount is above zero', async () => {
    const usedNumber = makeNumber({
      id: 'num-1',
      number: 'E-001',
      used: true,
      usedAt: '2026-02-01T00:00:00.000Z',
    });
    vi.mocked(emergencyNumbersApi.fetchEmergencyNumbers).mockResolvedValue(
      makeResponse({ numbers: [usedNumber], availableCount: 0, usedCount: 1 })
    );
    renderSection();

    expect(await screen.findByText('מאגר מספרי החירום ריק')).toBeInTheDocument();
    expect(screen.getByText('כל מספרי החירום נוצלו — יש להזין מספרים חדשים')).toBeInTheDocument();
  });

  it('add button is disabled when textarea is empty', async () => {
    vi.mocked(emergencyNumbersApi.fetchEmergencyNumbers).mockResolvedValue(
      makeResponse({ numbers: [], availableCount: 0, usedCount: 0 })
    );
    renderSection();

    await screen.findByText('לא הוזנו מספרי חירום עדיין');

    const addButton = screen.getByRole('button', { name: 'הוסף מספרים' });
    expect(addButton).toBeDisabled();
  });

  it('add button is enabled after typing in textarea', async () => {
    const user = userEvent.setup();
    vi.mocked(emergencyNumbersApi.fetchEmergencyNumbers).mockResolvedValue(
      makeResponse({ numbers: [], availableCount: 0, usedCount: 0 })
    );
    renderSection();

    await screen.findByText('לא הוזנו מספרי חירום עדיין');

    const textarea = screen.getByPlaceholderText('הזן מספר חירום בכל שורה');
    await user.type(textarea, 'E-999');

    expect(screen.getByRole('button', { name: 'הוסף מספרים' })).not.toBeDisabled();
  });

  it('does not show delete button for used numbers', async () => {
    const numbers = [
      makeNumber({ id: 'num-1', number: 'E-001', used: false }),
      makeNumber({ id: 'num-2', number: 'E-002', used: true, usedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    vi.mocked(emergencyNumbersApi.fetchEmergencyNumbers).mockResolvedValue(
      makeResponse({ numbers, availableCount: 1, usedCount: 1 })
    );
    renderSection();

    await screen.findByText('E-001');

    // Only one delete button should exist (for the available number, not the used one)
    const deleteButtons = screen.getAllByTitle('הסר מספר');
    expect(deleteButtons).toHaveLength(1);
  });
});
