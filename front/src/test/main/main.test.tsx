import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import App from '../../App';
import { renderWithProviders } from '../utils/renderWithProviders';

const renderMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderMock }));
const ReactQueryDevtoolsMock = () => null;

vi.mock('react-dom/client', () => ({
  default: { createRoot: createRootMock },
  createRoot: createRootMock,
}));

vi.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtools: ReactQueryDevtoolsMock,
}));

describe('Main bootstrap', () => {
  it('renders App inside providers without crashing', () => {
    const { container } = renderWithProviders(<App />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe('main.tsx entrypoint', () => {
  const containsComponent = (node: React.ReactNode, component: React.ComponentType): boolean => {
    if (!node) return false;
    if (Array.isArray(node)) {
      return node.some((child) => containsComponent(child, component));
    }
    if (!React.isValidElement(node)) return false;
    if (node.type === component) return true;
    const element = node as React.ReactElement<{ children?: React.ReactNode }>;
    return containsComponent(element.props?.children, component);
  };

  const getRenderedTree = () => {
    const call = renderMock.mock.calls[0];
    if (!call) throw new Error('Expected render to be called');
    const [tree] = call;
    if (!React.isValidElement(tree)) {
      throw new Error('Expected rendered tree to be a valid React element');
    }
    return tree;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost');
    createRootMock.mockClear();
    renderMock.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllEnvs();
  });

  it('creates the root element and renders the app tree', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost');
    await import('../../main');

    const rootElement = document.getElementById('root');
    expect(rootElement).not.toBeNull();
    expect(createRootMock).toHaveBeenCalledWith(rootElement);
    expect(renderMock).toHaveBeenCalledTimes(1);

    const renderedTree = getRenderedTree();
    expect(renderedTree.type).toBe(React.StrictMode);
  });

  it('includes ReactQueryDevtools when running in development', async () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost');
    vi.resetModules();
    await import('../../main');

    const renderedTree = getRenderedTree();
    expect(containsComponent(renderedTree, ReactQueryDevtoolsMock)).toBe(true);
  });

  it('omits ReactQueryDevtools outside of development', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost');
    vi.resetModules();
    await import('../../main');

    const renderedTree = getRenderedTree();
    expect(containsComponent(renderedTree, ReactQueryDevtoolsMock)).toBe(false);
  });
});
