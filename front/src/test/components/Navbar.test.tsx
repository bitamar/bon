import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import Navbar from '../../Navbar';
import { renderWithProviders } from '../utils/renderWithProviders';
import { AppShell } from '@mantine/core';

describe('Navbar', () => {
  it('renders navigation links', () => {
    renderWithProviders(
      <AppShell navbar={{ width: 280, breakpoint: 'sm' }}>
        <AppShell.Navbar>
          <Navbar />
        </AppShell.Navbar>
      </AppShell>
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
