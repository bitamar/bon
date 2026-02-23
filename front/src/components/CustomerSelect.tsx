import { Anchor, Select, Stack } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCustomers } from '../api/customers';
import { queryKeys } from '../lib/queryKeys';

interface CustomerSelectProps {
  businessId: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

export function CustomerSelect({
  businessId,
  value,
  onChange,
  disabled,
}: Readonly<CustomerSelectProps>) {
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);

  const { data, error } = useQuery({
    queryKey: [...queryKeys.customers(businessId), { q: debouncedSearch || undefined, limit: 50 }],
    queryFn: () => fetchCustomers(businessId, debouncedSearch || undefined, undefined, 50),
    enabled: !!businessId,
  });

  const options = (data?.customers ?? []).map((c) => ({
    value: c.id,
    label: c.city ? `${c.name} (${c.taxId ?? ''}) — ${c.city}` : `${c.name} (${c.taxId ?? ''})`,
  }));

  return (
    <Stack gap={4}>
      <Select
        label="לקוח"
        placeholder="חיפוש לקוח..."
        searchable
        clearable
        nothingFoundMessage="לא נמצאו לקוחות"
        data={options}
        value={value}
        onChange={onChange}
        onSearchChange={setSearch}
        disabled={disabled ?? false}
        error={error ? 'שגיאה בטעינת לקוחות' : undefined}
      />
      <Anchor component={Link} to="/business/customers/new" size="sm">
        + לקוח חדש
      </Anchor>
    </Stack>
  );
}
