import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DirectionProvider, MantineProvider } from '@mantine/core';
import { PageTitle } from '../../components/PageTitle';

const renderWithColorScheme = (colorScheme: 'light' | 'dark', disableLightOverride = false) => {
  render(
    <DirectionProvider>
      <MantineProvider forceColorScheme={colorScheme}>
        <PageTitle disableLightOverride={disableLightOverride}>Title</PageTitle>
      </MantineProvider>
    </DirectionProvider>
  );
};

describe('PageTitle', () => {
  it('applies light-mode styling overrides when color scheme is light', () => {
    renderWithColorScheme('light');
    const title = screen.getByRole('heading', { name: 'Title' });
    expect(title).toHaveStyle({
      color: '#616161',
      textShadow: '-1px 1px 1px #b6b6b6',
    });
  });

  it('does not override styles when disabled', () => {
    renderWithColorScheme('light', true);
    const title = screen.getByRole('heading', { name: 'Title' });
    expect(title).not.toHaveStyle({
      textShadow: '-1px 1px 1px #b6b6b6',
    });
  });
});
