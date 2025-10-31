import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

const HIDE_DELAY_MS = 300;

const GlobalLoadingContext = createContext(false);

export function useGlobalLoading() {
  return useContext(GlobalLoadingContext);
}

export function GlobalLoadingIndicator({ children }: { children?: ReactNode }) {
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const busy = isFetching + isMutating > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (busy) {
      setVisible(true);
    } else {
      timeout = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
    }

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [busy]);

  return <GlobalLoadingContext.Provider value={visible}>{children}</GlobalLoadingContext.Provider>;
}
