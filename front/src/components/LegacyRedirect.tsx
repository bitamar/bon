import { Navigate, useLocation } from 'react-router-dom';

const ACTIVE_BUSINESS_KEY = 'bon:activeBusiness';

export function LegacyRedirect() {
  const location = useLocation();
  const businessId = localStorage.getItem(ACTIVE_BUSINESS_KEY);

  if (!businessId) {
    return <Navigate to="/businesses" replace />;
  }

  const suffix = location.pathname.replace(/^\/business/, '');
  const canonicalPath = `/businesses/${businessId}${suffix}`;
  const fullPath = `${canonicalPath}${location.search}${location.hash}`;

  return <Navigate to={fullPath} replace />;
}
