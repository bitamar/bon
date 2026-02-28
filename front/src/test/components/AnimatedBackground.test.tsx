import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { AnimatedBackground } from '../../components/AnimatedBackground';
import { renderWithProviders } from '../utils/renderWithProviders';

describe('AnimatedBackground', () => {
  it('renders children', () => {
    renderWithProviders(
      <AnimatedBackground>
        <span>child content</span>
      </AnimatedBackground>
    );
    expect(screen.getByText('child content')).toBeInTheDocument();
  });
});
