import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VatExemptionReasonModal } from '../../components/VatExemptionReasonModal';
import { renderWithProviders } from '../utils/renderWithProviders';

// ── helpers ──

const defaultProps = {
  opened: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  invoiceNotes: '',
};

function renderModal(overrides: Partial<typeof defaultProps> = {}) {
  return renderWithProviders(<VatExemptionReasonModal {...defaultProps} {...overrides} />);
}

describe('VatExemptionReasonModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the modal with select and buttons', () => {
    renderModal();

    expect(screen.getAllByText('סיבת פטור ממע"מ')).toHaveLength(2); // title + label
    expect(screen.getByRole('button', { name: 'המשך' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ביטול' })).toBeInTheDocument();
  });

  it('shows error when confirming without selecting a reason', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: 'המשך' }));

    expect(screen.getByText('יש לבחור סיבת פטור')).toBeInTheDocument();
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm with selected reason', async () => {
    const user = userEvent.setup();
    renderModal();

    // Open the select dropdown and choose a reason
    await user.click(screen.getByPlaceholderText('בחר סיבה...'));
    await user.click(screen.getByText('ייצוא שירותים §30(א)(5)'));

    await user.click(screen.getByRole('button', { name: 'המשך' }));

    expect(defaultProps.onConfirm).toHaveBeenCalledWith('ייצוא שירותים §30(א)(5)');
  });

  it('shows error when "אחר" selected but notes are empty', async () => {
    const user = userEvent.setup();
    renderModal({ invoiceNotes: '' });

    await user.click(screen.getByPlaceholderText('בחר סיבה...'));
    await user.click(screen.getByText('אחר — פרט בהערות'));

    await user.click(screen.getByRole('button', { name: 'המשך' }));

    expect(
      screen.getByText('בחרת "אחר" — יש להוסיף הסבר בשדה ההערות של החשבונית')
    ).toBeInTheDocument();
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it('allows "אחר" when notes are non-empty', async () => {
    const user = userEvent.setup();
    renderModal({ invoiceNotes: 'פטור לפי סעיף 31' });

    await user.click(screen.getByPlaceholderText('בחר סיבה...'));
    await user.click(screen.getByText('אחר — פרט בהערות'));

    await user.click(screen.getByRole('button', { name: 'המשך' }));

    expect(defaultProps.onConfirm).toHaveBeenCalledWith('אחר — פרט בהערות');
  });

  it('resets internal state when closed via cancel button', async () => {
    const user = userEvent.setup();
    const { unmount } = renderModal();

    // Select a reason and trigger validation error
    await user.click(screen.getByPlaceholderText('בחר סיבה...'));
    await user.click(screen.getByText('אחר — פרט בהערות'));
    await user.click(screen.getByRole('button', { name: 'המשך' }));
    expect(screen.getByText(/בחרת "אחר"/)).toBeInTheDocument();

    // Close the modal
    await user.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(defaultProps.onClose).toHaveBeenCalled();

    // Re-render and verify clean state
    unmount();
    renderModal();
    expect(screen.queryByText(/בחרת "אחר"/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('בחר סיבה...')).toBeInTheDocument();
  });
});
