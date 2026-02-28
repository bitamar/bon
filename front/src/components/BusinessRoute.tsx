import { Outlet, useParams } from 'react-router-dom';
import { Container } from '@mantine/core';
import { StatusCard } from './StatusCard';
import { useBusiness } from '../contexts/BusinessContext';

export function BusinessRoute() {
  const { businessId } = useParams<{ businessId: string }>();
  const { businesses, isLoading } = useBusiness();

  if (isLoading) {
    return null;
  }

  if (!businessId || !businesses.some((b) => b.id === businessId)) {
    return (
      <Container size="sm" pt="xl" pb="xl">
        <StatusCard
          status="error"
          title="העסק לא נמצא"
          description="אין לך גישה לעסק זה, או שהוא לא קיים"
        />
      </Container>
    );
  }

  return <Outlet />;
}
