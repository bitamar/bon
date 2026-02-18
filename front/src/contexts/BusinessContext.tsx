import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { fetchBusinesses } from '../api/businesses';
import type { BusinessListItem } from '@bon/types/businesses';

const ACTIVE_BUSINESS_KEY = 'bon:activeBusiness';

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
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(() => {
    return localStorage.getItem(ACTIVE_BUSINESS_KEY);
  });

  const { data, isPending } = useQuery({
    queryKey: queryKeys.userBusinesses(),
    queryFn: () => fetchBusinesses(),
    staleTime: 5 * 60 * 1000,
  });

  const businesses = data?.businesses ?? [];

  useEffect(() => {
    if (businesses.length > 0 && !activeBusinessId) {
      const firstBusiness = businesses[0];
      if (firstBusiness) {
        setActiveBusinessId(firstBusiness.id);
        localStorage.setItem(ACTIVE_BUSINESS_KEY, firstBusiness.id);
      }
    }

    if (activeBusinessId && !businesses.find((b) => b.id === activeBusinessId)) {
      if (businesses.length > 0) {
        const firstBusiness = businesses[0];
        if (firstBusiness) {
          setActiveBusinessId(firstBusiness.id);
          localStorage.setItem(ACTIVE_BUSINESS_KEY, firstBusiness.id);
        }
      } else {
        setActiveBusinessId(null);
        localStorage.removeItem(ACTIVE_BUSINESS_KEY);
      }
    }
  }, [businesses, activeBusinessId]);

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
      setActiveBusinessId(businessId);
      localStorage.setItem(ACTIVE_BUSINESS_KEY, businessId);
      queryClient.invalidateQueries();
    },
    [queryClient]
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
