import { Navigate, useLocation } from 'react-router-dom';
import { ACTIVE_BUSINESS_KEY } from '../lib/storage';

export function LegacyRedirect() {
  const location = useLocation();
  const businessId = localStorage.getItem(ACTIVE_BUSINESS_KEY);

  if (!businessId) {
    return <Navigate to="/businesses" replace />;
  }

  const suffix = location.pathname.replace(/^\/business(?=\/|$)/, '');
  const normalizedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
  const encodedId = encodeURIComponent(businessId);
  const canonicalPath = `/businesses/${encodedId}${normalizedSuffix}`;
  const fullPath = `${canonicalPath}${location.search}${location.hash}`;

  return <Navigate to={fullPath} replace />;
}
