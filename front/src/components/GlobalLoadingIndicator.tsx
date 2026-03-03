import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

const SHOW_DELAY_MS = 120;
const HIDE_DELAY_MS = 300;

const GlobalLoadingContext = createContext(false);

export function useGlobalLoading() {
  return useContext(GlobalLoadingContext);
}

/**
 * Thin animated progress bar fixed to the top of the viewport.
 * Shows after a short delay so instant requests never flash.
 */
function ProgressBar({ visible }: Readonly<{ visible: boolean }>) {
  return (
    <progress
      aria-hidden={!visible}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        height: 3,
        zIndex: 9999,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease-out',
        appearance: 'none',
        border: 'none',
        background: 'transparent',
      }}
    />
  );
}

export function GlobalLoadingIndicator({ children }: Readonly<{ children?: ReactNode }>) {
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const busy = isFetching + isMutating > 0;
  const [visible, setVisible] = useState(false);
  const showTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(showTimeout.current);
    clearTimeout(hideTimeout.current);

    if (busy) {
      // Delay showing so very fast requests never flash the bar
      showTimeout.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    } else {
      // Keep bar visible briefly after finishing so it doesn't flicker
      hideTimeout.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
    }

    return () => {
      clearTimeout(showTimeout.current);
      clearTimeout(hideTimeout.current);
    };
  }, [busy]);

  return (
    <GlobalLoadingContext.Provider value={visible}>
      <ProgressBar visible={visible} />
      {children}
    </GlobalLoadingContext.Provider>
  );
}
