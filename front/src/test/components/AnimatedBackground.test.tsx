import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { AnimatedBackground } from '../../components/AnimatedBackground';
import { renderWithProviders } from '../utils/renderWithProviders';

describe('AnimatedBackground', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders children', () => {
    renderWithProviders(
      <AnimatedBackground>
        <span>child content</span>
      </AnimatedBackground>
    );
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('spawns blobs after timer fires', () => {
    vi.useFakeTimers();

    // Mock Element.prototype.animate since jsdom doesn't support it
    const mockAnimate = vi.fn(() => ({ onfinish: null }));
    Element.prototype.animate = mockAnimate as unknown as typeof Element.prototype.animate;

    renderWithProviders(
      <AnimatedBackground>
        <span>content</span>
      </AnimatedBackground>
    );

    // Advance past the first scheduled delay (5000-12000ms)
    vi.advanceTimersByTime(15000);

    expect(mockAnimate).toHaveBeenCalled();
  });
});
