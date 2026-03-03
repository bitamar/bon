import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { queryKeys } from '../lib/queryKeys';
import { fetchBusinesses } from '../api/businesses';
import type { BusinessListItem } from '@bon/types/businesses';
import { ACTIVE_BUSINESS_KEY } from '../lib/storage';

function buildBusinessPath(
  businessId: string,
  location: { pathname: string; search: string; hash: string }
): string {
  const match = /^\/businesses\/[^/]+/.exec(location.pathname);
  const suffix = match ? location.pathname.slice(match[0].length) : '';
  return `/businesses/${businessId}${suffix || '/dashboard'}${location.search}${location.hash}`;
}

interface ActiveBusiness {
  id: string;
  name: string;
  businessType: string;
  role: string;
}

interface BusinessContextValue {
  activeBusiness: ActiveBusiness | null;
  businesses: BusinessListItem[];
  switchBusiness: (businessId: string) => void;
  isLoading: boolean;
}

const BusinessContext = createContext<BusinessContextValue | undefined>(undefined);

export function BusinessProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const params = useParams<{ businessId?: string }>();

  const urlBusinessId = params.businessId ?? null;

  const [fallbackBusinessId, setFallbackBusinessId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_BUSINESS_KEY)
  );

  const activeBusinessId = urlBusinessId ?? fallbackBusinessId;

  // Sync localStorage when URL businessId changes
  useEffect(() => {
    if (urlBusinessId) {
      localStorage.setItem(ACTIVE_BUSINESS_KEY, urlBusinessId);
      setFallbackBusinessId(urlBusinessId);
    }
  }, [urlBusinessId]);

  const { data, isPending } = useQuery({
    queryKey: queryKeys.userBusinesses(),
    queryFn: () => fetchBusinesses(),
    staleTime: 5 * 60 * 1000,
  });

  const businesses = data?.businesses ?? [];

  // Auto-select first business if none is active, or recover from invalid URL businessId
  useEffect(() => {
    if (businesses.length > 0 && !activeBusinessId && businesses[0]) {
      setFallbackBusinessId(businesses[0].id);
      localStorage.setItem(ACTIVE_BUSINESS_KEY, businesses[0].id);
    }

    // Don't invalidate while still loading — businesses is [] during fetch
    if (isPending) return;

    // activeBusinessId is valid — nothing to recover
    if (!activeBusinessId || businesses.some((b) => b.id === activeBusinessId)) return;

    // No businesses at all — clear everything
    if (businesses.length === 0) {
      setFallbackBusinessId(null);
      localStorage.removeItem(ACTIVE_BUSINESS_KEY);
      return;
    }

    // Recover: fall back to first available business
    const fallback = businesses[0];
    if (!fallback) return;

    setFallbackBusinessId(fallback.id);
    localStorage.setItem(ACTIVE_BUSINESS_KEY, fallback.id);
    // When the invalid id came from the URL, replace it so activeBusiness resolves
    if (urlBusinessId) {
      navigate(buildBusinessPath(fallback.id, location), { replace: true });
    }
  }, [businesses, activeBusinessId, isPending, urlBusinessId, location, navigate]);

  const activeBusiness = useMemo(() => {
    if (!activeBusinessId) return null;
    const business = businesses.find((b) => b.id === activeBusinessId);
    if (!business) return null;
    return {
      id: business.id,
      name: business.name,
      businessType: business.businessType,
      role: business.role,
    };
  }, [activeBusinessId, businesses]);

  const switchBusiness = useCallback(
    (businessId: string) => {
      const oldId = activeBusinessId;
      if (businessId === oldId) return;
      localStorage.setItem(ACTIVE_BUSINESS_KEY, businessId);
      setFallbackBusinessId(businessId);

      if (oldId) {
        queryClient.invalidateQueries({ queryKey: ['businesses', oldId] });
      }

      navigate(buildBusinessPath(businessId, locationRef.current));
    },
    [activeBusinessId, queryClient, navigate]
  );

  const value = useMemo(
    () => ({
      activeBusiness,
      businesses,
      switchBusiness,
      isLoading: isPending,
    }),
    [activeBusiness, businesses, switchBusiness, isPending]
  );

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness must be used within BusinessProvider');
  return ctx;
}
